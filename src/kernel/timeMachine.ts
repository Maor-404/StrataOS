import Dexie, { type Table } from 'dexie'
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'
import { kernelClient } from './kernelClient'

export interface TimeMachineRecord {
  id?: number
  label: string
  createdAt: string
  sizeBytes: number
  uncompressedBytes: number
  fileCount: number
  installedPackages: string[]
  compressedData: Uint8Array
}

interface SnapshotPayload {
  version: string
  createdAt: string
  label: string
  files: Array<{
    path: string
    base64: string
  }>
}

class StrataTimeMachineDB extends Dexie {
  snapshots!: Table<TimeMachineRecord, number>

  constructor() {
    super('strataos_timemachine_v1')
    this.version(1).stores({
      snapshots: '++id, label, createdAt',
    })
  }
}

export const timeMachineDb = new StrataTimeMachineDB()

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

export async function createTimeMachineSnapshot(customLabel?: string): Promise<TimeMachineRecord> {
  const filePaths = await kernelClient.searchUserFiles()
  const files: SnapshotPayload['files'] = []

  for (const path of filePaths) {
    try {
      const bytes = await kernelClient.readFileBytes(path)
      files.push({
        path,
        base64: uint8ToBase64(bytes),
      })
    } catch {
      // skip unreadable files
    }
  }

  const installed = await kernelClient.getInstalledPackages()
  const nowIso = new Date().toISOString()
  const label =
    customLabel?.trim() ||
    `Bedrock Checkpoint (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})`

  const payload: SnapshotPayload = {
    version: '1.0.0',
    createdAt: nowIso,
    label,
    files,
  }

  const rawBytes = strToU8(JSON.stringify(payload))
  const compressed = gzipSync(rawBytes, { level: 6 })

  const record: TimeMachineRecord = {
    label,
    createdAt: nowIso,
    sizeBytes: compressed.byteLength,
    uncompressedBytes: rawBytes.byteLength,
    fileCount: files.length,
    installedPackages: installed.map((p) => p.id),
    compressedData: compressed,
  }

  const id = await timeMachineDb.snapshots.add(record)
  return { ...record, id }
}

export async function listTimeMachineSnapshots(): Promise<TimeMachineRecord[]> {
  const all = await timeMachineDb.snapshots.orderBy('id').reverse().toArray()
  return all
}

export async function restoreTimeMachineSnapshot(id: number): Promise<{ restoredFiles: number }> {
  const record = await timeMachineDb.snapshots.get(id)
  if (!record) throw new Error(`Snapshot #${id} not found`)

  const decompressed = gunzipSync(record.compressedData)
  const payload = JSON.parse(strFromU8(decompressed)) as SnapshotPayload

  let restored = 0
  for (const f of payload.files) {
    const bytes = base64ToUint8(f.base64)
    await kernelClient.writeFileBytes(f.path, bytes)
    if (f.path.endsWith('.wasm') || f.path.endsWith('.sh') || f.path.startsWith('/usr/local/bin/')) {
      await kernelClient.execCommand('/bin/chmod', ['+x', f.path])
    }
    restored++
  }

  await kernelClient.syncDisk()
  return { restoredFiles: restored }
}

export async function deleteTimeMachineSnapshot(id: number): Promise<void> {
  await timeMachineDb.snapshots.delete(id)
}
