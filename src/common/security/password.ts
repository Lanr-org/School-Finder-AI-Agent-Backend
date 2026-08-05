import * as argon from 'argon2'

const hashPassword = async (password: string) => {
  try {
    const hashedPassword = await argon.hash(password)
    return hashedPassword
  } catch {
    throw new Error('Error hashing password')
  }
}

const verifyPassword = async (
  hashedPassword: string,
  plainPassword: string,
) => {
  try {
    if (await argon.verify(hashedPassword, plainPassword)) {
      return true
    }
    return false
  } catch {
    throw new Error('Error verifying password')
  }
}

export { hashPassword, verifyPassword }
