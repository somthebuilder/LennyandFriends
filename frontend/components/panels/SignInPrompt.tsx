'use client'

import AuthModal from '@/components/AuthModal'

interface SignInPromptProps {
  isOpen: boolean
  onClose: () => void
  message: string
  onSuccess?: () => void
}

export default function SignInPrompt({
  isOpen,
  onClose,
  message,
  onSuccess,
}: SignInPromptProps) {
  const handleSuccess = () => {
    onSuccess?.()
    onClose()
  }

  return (
    <AuthModal
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={handleSuccess}
      mode="signin"
    />
  )
}

