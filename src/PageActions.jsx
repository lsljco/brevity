import {createContext,useContext} from 'react'
import {createPortal} from 'react-dom'
export const PageActionsContext=createContext(null)
export default function PageActions({children}) {
 const target=useContext(PageActionsContext)
 return target?createPortal(children,target):children
}
