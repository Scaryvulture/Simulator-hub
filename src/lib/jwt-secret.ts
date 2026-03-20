const JWT_SECRET = process.env.APP_JWT_SECRET

if (!JWT_SECRET) {
    throw new Error('APP_JWT_SECRET environment variable is required')
}

const secretKey = new TextEncoder().encode(JWT_SECRET)

export function getAppJwtSecretKey() {
    return secretKey
}
