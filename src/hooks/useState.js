import { useState } from 'react'

export const useAppState = () => {
  const [tracks, setTracks] = useState([])
  const [query, setQuery] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forcePlayKey, setForcePlayKey] = useState(0)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [pendingDeleteUrl, setPendingDeleteUrl] = useState('')
  const [pendingDeleteName, setPendingDeleteName] = useState('')
  const [passwordErrorCount, setPasswordErrorCount] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressTitle, setProgressTitle] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressValue, setProgressValue] = useState(0)

  return {
    // 基础状态
    tracks, setTracks,
    query, setQuery,
    currentIndex, setCurrentIndex,
    loading, setLoading,
    error, setError,
    forcePlayKey, setForcePlayKey,
    
    // 模态框状态
    passwordOpen, setPasswordOpen,
    settingsOpen, setSettingsOpen,
    progressOpen, setProgressOpen,
    
    // 删除相关
    pendingDeleteUrl, setPendingDeleteUrl,
    pendingDeleteName, setPendingDeleteName,
    passwordErrorCount, setPasswordErrorCount,
    
    // 进度相关
    progressTitle, setProgressTitle,
    progressMessage, setProgressMessage,
    progressValue, setProgressValue,
    
  }
}
