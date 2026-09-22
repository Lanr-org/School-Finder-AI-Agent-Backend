import prisma from '../../database/prisma.js'

export class SettingsRepo {
  static findAllGroupsWithValues = async () => {
    return prisma.settingGroup.findMany({
      orderBy: { key: 'asc' },
      include: { values: { orderBy: { label: 'asc' } } },
    })
  }

  static findGroupByKey = async (key: string) => {
    return prisma.settingGroup.findUnique({ where: { key } })
  }

  static findGroupByKeyWithValues = async (key: string) => {
    return prisma.settingGroup.findUnique({
      where: { key },
      include: { values: { orderBy: { label: 'asc' } } },
    })
  }

  static createValue = async (
    groupId: string,
    data: { key: string; label: string },
  ) => {
    return prisma.settingValue.create({
      data: { group_id: groupId, key: data.key, label: data.label },
    })
  }

  static findValueInGroup = async (groupId: string, valueId: string) => {
    return prisma.settingValue.findFirst({
      where: { id: valueId, group_id: groupId },
    })
  }

  static updateValue = async (
    id: string,
    data: { label?: string | undefined; isActive?: boolean | undefined },
  ) => {
    return prisma.settingValue.update({
      where: { id },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
      },
    })
  }

  static deleteValue = async (id: string) => {
    return prisma.settingValue.delete({ where: { id } })
  }
}
