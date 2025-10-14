export const useError = () => {
  const handleError = (error, context = '') => {
    console.error(`${context}错误:`, error)
    const message = error?.message || error?.toString() || '未知错误'
    console.warn(`${context}${context ? ': ' : ''}${message}`)
  }

  return { handleError }
}
