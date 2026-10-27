const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
export const projectImageSource = project => ({
  title:clean(project.title).slice(0,300), type:clean(project.type).slice(0,60),
  room:clean(project.room === 'Other' ? project.roomCustom : project.room).slice(0,200),
  details:clean(project.notes).slice(0,2000),
})
export const projectImageSourceKey = project => JSON.stringify(projectImageSource(project))
export const needsProjectImage = project => Boolean(project?.id && project.autoImageEnabled && !project.photos?.length)
