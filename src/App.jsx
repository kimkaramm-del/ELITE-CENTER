import AppRouter from './app/AppRouter.jsx'
import { LocaleProvider } from './contexts/LocaleContext.jsx'

export default function App() {
  return <LocaleProvider><AppRouter /></LocaleProvider>
}
