import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000'
})

export const getKPIs =
  () => api.get('/kpis').then(r => r.data)

export const getTransport =
  () => api.get('/transport').then(r => r.data)

export const getSuppliers =
  () => api.get('/suppliers').then(r => r.data)

export const getActivities =
  () => api.get('/activities').then(r => r.data)

export const getViolations =
  (params) => api.get('/violations', { params }).then(r => r.data)

export const getRecommendations =
  () => api.get('/recommendations').then(r => r.data)

export const getProcessMap =
  () => api.get('/process-map').then(r => r.data)

export const simulateDecision = (params) =>
  api.get('/simulate', { params }).then(r => r.data)

export const getAIRisk = (params) =>
  api.get('/ai-risk', { params }).then(r => r.data)

export const getAICopilot = (params) =>
  api.get('/ai-copilot', { params }).then(r => r.data)


export const getGreenRoute = (params) =>
  api.get('/green-route', { params })
     .then(r => r.data)
     
export const getCarbonFitness = (params) =>
  api.get('/carbon-fitness', { params }).then(r => r.data)


export const getEmissionAttribution = async () => {
  const res = await fetch('http://localhost:8000/emission-attribution')
  return res.json()
}


export const getProcessVariants = () =>
  api.get('/process-variants').then(r => r.data)