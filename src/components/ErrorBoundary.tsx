import React from 'react'

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: React.ReactNode }) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught error:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, color: 'white', background: '#1a1b23', minHeight: '50vh' }}>
                    <h2 style={{ color: '#ef4444', fontSize: 24, marginBottom: 16 }}>⚠️ Something went wrong</h2>
                    <p style={{ color: '#9ca3af', marginBottom: 16 }}>The wallet page encountered an error:</p>
                    <pre style={{
                        background: '#12131a',
                        color: '#f87171',
                        padding: 16,
                        borderRadius: 8,
                        overflow: 'auto',
                        fontSize: 14,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                    }}>
                        {this.state.error?.message}
                        {'\n\n'}
                        {this.state.error?.stack}
                    </pre>
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: null })
                            window.location.reload()
                        }}
                        style={{
                            marginTop: 16,
                            padding: '10px 24px',
                            background: '#6366f1',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 14
                        }}
                    >
                        Reload Page
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
