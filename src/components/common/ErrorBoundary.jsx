import { Component } from 'react';
import { C } from '../../config/constants';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("앱 에러:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, color: C.white, fontFamily: "sans-serif" }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>앱에 오류가 발생했습니다</div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 16, textAlign: "center", maxWidth: 300 }}>
            {String((this.state.error && this.state.error.message) || this.state.error)}
          </div>
          <button onClick={() => { this.setState({ hasError: false, error: null }); }}
            style={{ background: C.accent, color: C.bg, border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            다시 시도
          </button>
          <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ background: C.grayDark, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
