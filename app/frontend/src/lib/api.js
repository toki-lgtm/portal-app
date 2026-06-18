export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function authConfig() {
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
}

export function authConfigMultipart() {
  // Content-Type は指定しない。axios が FormData を検出して
  // boundary 付きの multipart/form-data を自動設定する（手動指定すると
  // boundary が欠落し、サーバー側(multer)がファイルをパースできなくなる）。
  const token = localStorage.getItem('authToken')
  return { headers: { Authorization: `Bearer ${token}` } }
}
