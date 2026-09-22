export interface CreateNoteDTO {
  body: string
}

export interface UpdateNoteDTO {
  body: string
}

export interface ListNotesQueryDTO {
  page: number
  limit: number
}
