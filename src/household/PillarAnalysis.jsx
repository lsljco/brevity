import PillarAnalysisCore from './PillarAnalysisCore.jsx'
import IsaiahDailyTutor from '../education/IsaiahDailyTutor.jsx'

export default function PillarAnalysis(props) {
  if (props.pillar?.id === 'education') return <IsaiahDailyTutor currentMember={props.currentMember}/>
  return <PillarAnalysisCore {...props}/>
}
