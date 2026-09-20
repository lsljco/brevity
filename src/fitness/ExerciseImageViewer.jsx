import { useEffect, useState } from 'react'
import { getDisplayExerciseImage } from './exerciseImagePolicy.js'
import './ExerciseImageViewer.css'

export default function ExerciseImageViewer({ exercise, className = '', imageClassName = '', loading = 'lazy', children }) {
  const [open, setOpen] = useState(false)
  const [failedImage, setFailedImage] = useState(null)
  const image = getDisplayExerciseImage(exercise)
  const available = Boolean(image && image !== failedImage)

  useEffect(() => { setOpen(false) }, [exercise.id, image])
  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = event => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  if (!available) return <div className={`exercise-image-unavailable ${className}`.trim()}>
    <i className="ti ti-photo-off" aria-hidden="true" />
    <strong>Exercise-specific image pending</strong>
    <small>{exercise.name}: no substitute photo is shown.</small>
    {children}
  </div>

  const imageFailed = () => { setFailedImage(image); setOpen(false) }
  const alt = `${exercise.name} — exercise reference`
  return <>
    <button type="button" className={`exercise-image-open ${className}`.trim()} onClick={() => setOpen(true)} aria-label={`Enlarge ${exercise.name} exercise image`}>
      <img className={imageClassName} src={image} alt={alt} loading={loading} onError={imageFailed} />
      {children}
      <span className="exercise-image-zoom-hint" aria-hidden="true"><i className="ti ti-maximize" /></span>
    </button>
    {open && <div className="exercise-image-viewer" role="dialog" aria-modal="true" aria-label={`${exercise.name} enlarged exercise image`} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <article>
        <button type="button" className="exercise-image-viewer-close" onClick={() => setOpen(false)} aria-label="Close enlarged exercise image"><i className="ti ti-x" /></button>
        <img src={image} alt={alt} onError={imageFailed} />
        <div><span>{exercise.muscles.join(' · ')}</span><h2>{exercise.name}</h2><p>{exercise.cue}</p></div>
      </article>
    </div>}
  </>
}

// The goal-builder thumbnail must obey the same mapping rules as the full card.
export function ExerciseImageThumbnail({ exercise }) {
  const [failedImage, setFailedImage] = useState(null)
  const image = getDisplayExerciseImage(exercise)
  if (!image || image === failedImage) return <span className="exercise-image-thumbnail-pending" title={`${exercise.name}: exercise-specific image pending`}>Image pending</span>
  return <img src={image} alt={`${exercise.name} — exercise reference`} onError={() => setFailedImage(image)} />
}
