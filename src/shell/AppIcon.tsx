import {
  Activity,
  Binary,
  Box,
  Braces,
  Calculator,
  Code2,
  Cpu,
  FileCode,
  FileText,
  Folder,
  FolderTree,
  HardDrive,
  Package,
  RefreshCw,
  Search,
  Settings,
  Sliders,
  Sparkles,
  Terminal,
  Wrench,
  type LucideProps,
} from 'lucide-react'
import type React from 'react'

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Terminal,
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
  HardDrive,
  Wrench,
  Search,
  RefreshCw,
}

export interface AppIconProps extends LucideProps {
  name: string
}

export const AppIcon: React.FC<AppIconProps> = ({ name, ...props }) => {
  const IconComponent = ICON_MAP[name] ?? Box
  return <IconComponent {...props} />
}
