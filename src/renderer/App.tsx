import { PetStage } from './pet/PetStage'
import { BubbleView } from './ui/BubbleView'
import { PanelView } from './ui/PanelView'
import { SettingsView } from './ui/SettingsView'

const view = new URLSearchParams(window.location.search).get('view')

function App() {
  if (view === 'bubble') return <BubbleView />
  if (view === 'settings') return <SettingsView />
  if (view === 'panel') return <PanelView />
  return <PetStage />
}

export default App
