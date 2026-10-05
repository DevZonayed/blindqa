import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const REPO = 'https://github.com/DevZonayed/blindqa'
export const DOCS = (page: string) => `/blindqa/${page}`
