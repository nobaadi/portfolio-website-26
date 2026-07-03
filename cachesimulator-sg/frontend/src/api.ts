// Trigger redeploy: trivial comment
import axios from 'axios';
import type {
  SimulateRequest,
  SimulateResponse,
  ExperimentSummary,
  ExperimentDetail,
  WorkloadInfo,
  ArchitecturePreset,
  SweepRequest,
  SweepResponse,
} from './types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
});

export const simulate = (req: SimulateRequest): Promise<SimulateResponse> =>
  api.post<SimulateResponse>('/simulate', req).then((r) => r.data);

export const sweep = (req: SweepRequest): Promise<SweepResponse> =>
  api.post<SweepResponse>('/sweep', req).then((r) => r.data);

export const simulateFromTrace = (params: {
  file: File;
  l1SizeKb: number;
  l2SizeKb: number;
  l3SizeKb: number;
}): Promise<SimulateResponse> => {
  const form = new FormData();
  form.append('file', params.file);
  const query = new URLSearchParams({
    size_kb_l1: String(params.l1SizeKb),
    size_kb_l2: String(params.l2SizeKb),
    size_kb_l3: String(params.l3SizeKb),
  });
  return api
    .post<SimulateResponse>(`/simulate/upload-trace?${query.toString()}`, form)
    .then((r) => r.data);
};

export const getExperiments = (): Promise<ExperimentSummary[]> =>
  api.get<ExperimentSummary[]>('/experiments').then((r) => r.data);

export const getExperiment = (id: number): Promise<ExperimentDetail> =>
  api.get<ExperimentDetail>(`/experiments/${id}`).then((r) => r.data);

export const deleteExperiment = (id: number): Promise<void> =>
  api.delete(`/experiments/${id}`).then(() => undefined);

export const getWorkloads = (): Promise<WorkloadInfo[]> =>
  api.get<WorkloadInfo[]>('/workloads').then((r) => r.data);

export const getPresets = (): Promise<ArchitecturePreset[]> =>
  api.get<ArchitecturePreset[]>('/presets').then((r) => r.data);

export const exportCsvUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/experiments/export/csv`;
