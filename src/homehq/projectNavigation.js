export const PROJECT_OPEN_EVENT='brevity:open-project'
export const requestProjectOpen=projectId=>window.dispatchEvent(new CustomEvent(PROJECT_OPEN_EVENT,{detail:{projectId}}))
