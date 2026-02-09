import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import DashboardNavbar from '@/components/navigation/DashboardNavbar'
import DashboardSidebar from '@/components/navigation/DashboardSidebar'
// MobileBottomNav removed - navigation accessible via header menu
import { wsService } from '@/services/websocket'
import { setBalance } from '@/store/slices/walletSlice'

const DashboardLayout = () => {
  const dispatch = useAppDispatch()
  const { isSidebarOpen } = useAppSelector((state) => state.ui)
  const { user } = useAppSelector((state) => state.auth)

  useEffect(() => {
    // Sync wallet balance from user's server balance
    if (user && user.balance !== undefined && user.balance !== null) {
      const balanceNum = typeof user.balance === 'string' ? parseFloat(user.balance) : user.balance
      if (!isNaN(balanceNum)) {
        dispatch(setBalance({
          total: balanceNum,
          available: balanceNum,
          blocked: 0,
          invested: 0,
        }))
      }
    }
  }, [user, dispatch])

  useEffect(() => {
    // Connect to WebSocket for live prices
    wsService.connect()
    
    return () => {
      wsService.disconnect()
    }
  }, [])

  return (
    <div className="min-h-screen min-h-[100dvh] bg-dark-bg overflow-x-hidden w-full max-w-full">
      {/* Top Navbar */}
      <DashboardNavbar />

      <div className="flex w-full max-w-full overflow-x-hidden">
        {/* Sidebar - Hidden on mobile */}
        <div className={`hidden lg:block ${isSidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300 flex-shrink-0`}>
          <DashboardSidebar />
        </div>

        {/* Main Content */}
        <main className={`flex-1 min-w-0 min-h-[calc(100vh-64px)] min-h-[calc(100dvh-64px)] pb-20 lg:pb-6 transition-all duration-300 overflow-x-hidden
          ${isSidebarOpen ? 'lg:ml-0' : 'lg:ml-0'}`}
        >
          <div className="p-3 sm:p-4 lg:p-6 w-full max-w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom nav removed. Use the header three-dot menu on mobile for navigation. */}
    </div>
  )
}

export default DashboardLayout
