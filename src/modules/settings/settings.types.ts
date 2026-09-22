export type SettingGroupKey = 'countries' | 'categories' | 'study-levels'

export interface CreateSettingValueDTO {
  label: string
}

export interface UpdateSettingValueDTO {
  label?: string | undefined
  isActive?: boolean | undefined
}
