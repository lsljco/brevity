import { useEffect, useState } from 'react'
import './ExerciseImageViewer.css'

export default function ExerciseImageViewer({ exercise, className = '', imageClassName = '', loading = 'lazy', children }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = event => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  return <>
    <button type="button" className={`exercise-image-open ${className}`.trim()} onClick={() => setOpen(true)} aria-label={`Enlarge ${exercise.name} exercise image`}>
      <img className={imageClassName} src={exercise.image} alt={`${exercise.name} performed with correct form`} loading={loading} />
      {children}
      <span className="exercise-image-zoom-hint" aria-hidden="true"><i className="ti ti-maximize" /></span>
    </button>
    {open && <div className="exercise-image-viewer" role="dialog" aria-modal="true" aria-label={`${exercise.name} enlarged exercise image`} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <article>
        <button type="button" className="exercise-image-viewer-close" onClick={() => setOpen(false)} aria-label="Close enlarged exercise image"><i className="ti ti-x" /></button>
        <img src={exercise.image} alt={`${exercise.name} performed with correct form`} />
        <div><span>{exercise.muscles.join(' · ')}</span><h2>{exercise.name}</h2><p>{exercise.cue}</p></div>
      </article>
    </div>}
  </>
}
