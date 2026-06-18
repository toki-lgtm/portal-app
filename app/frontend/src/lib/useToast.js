import { useState, useCallback } from 'react'

export function useToast() {
  const [toast, setToast] = useState(null)
  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }, [])
  return { toast, showToast }
}
