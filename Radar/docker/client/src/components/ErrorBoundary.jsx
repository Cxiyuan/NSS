import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, info);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          retry: this.handleRetry,
        });
      }

      return (
        <div role="alert" style={fallbackStyles.wrapper}>
          <h2 style={fallbackStyles.heading}>Something went wrong</h2>
          <pre style={fallbackStyles.message}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </pre>
          <button style={fallbackStyles.button} onClick={this.handleRetry}>
            Refresh
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const fallbackStyles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    margin: '1rem 0',
    borderRadius: '8px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    textAlign: 'center',
  },
  heading: {
    margin: '0 0 0.5rem',
    fontSize: '1.125rem',
    color: '#991b1b',
  },
  message: {
    margin: '0 0 1rem',
    fontSize: '0.875rem',
    color: '#b91c1c',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxWidth: '100%',
  },
  button: {
    padding: '0.5rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#dc2626',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
