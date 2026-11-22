import {
  Activity,
  AudioWaveform,
  Binary,
  Bot,
  Box,
  Braces,
  Calculator,
  Clock,
  Code2,
  Cpu,
  FileCode,
  FileText,
  Folder,
  FolderTree,
  Gamepad2,
  HardDrive,
  Layout,
  Monitor,
  Package,
  Palette,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
  type LucideProps,
} from 'lucide-react'
import type React from 'react'

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Terminal,
  Layout,
  Package,
  FolderTree,
  Folder,
  Code2,
  FileCode,
  Activity,
  Sliders,
  Settings,
  Binary,
  Sparkles,
  Calculator,
  FileText,
  Braces,
  Box,
  Cpu,
  Gpu: Zap,
  Bot,
  Waveform: AudioWaveform,
  Palette,
  Gamepad: Gamepad2,
  HardDrive,
  Wrench,
  Search,
  RefreshCw,
  Clock,
  Shield,
  Monitor,
}

export interface AppIconProps extends LucideProps {
  name?: string
  appId?: string
}

export const AppIcon: React.FC<AppIconProps> = ({ name, appId, ...props }) => {
  const key = name ?? appId ?? 'Box'
  const IconComponent = ICON_MAP[key] ?? Box
  return <IconComponent {...props} />
}
