import React from 'react'
import { Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'

function ProtectedRoute({ children }) {
  const { userData } = useSelector((state) => state.user)

  if (userData === null) {
    return <Navigate to="/auth" replace />
  }

  return children
}

export default ProtectedRoute
