import type {
  AgentConfig,
  EvaluationRunResponse,
  HealthResponse,
  MetricsResponse,
  ProcessedEmail,
  ReviewQueueItem,
  SyntheticGenerateResponse,
  TestCaseItem,
} from '../types/golfpm';

// Empty = same origin (FastAPI serves the built UI; `npm run dev` proxies /api to :8000).
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  isNetworkError: boolean;

  constructor(message: string, status = 0, isNetworkError = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let response: Response;
  const headers: Record<string, string> = {};
  if (init?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ApiError(
      `Unable to reach the GolfPM backend${API_BASE_URL ? ` at ${API_BASE_URL}` : ''}. Start it with: uvicorn golfpm.api:app --port 8000`,
      0,
      true,
    );
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (typeof errBody?.detail === 'string') {
        detail = errBody.detail;
      } else if (typeof errBody?.message === 'string') {
        detail = errBody.message;
      }
    } catch {
      // Ignore non-JSON error body
    }
    throw new ApiError(detail, response.status, false);
  }

  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export const golfpmApi = {
  getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('/api/health');
  },

  resetDemo(): Promise<{ status?: string; message?: string }> {
    return request('/api/reset?config=true', { method: 'POST' });
  },

  async getTestCases(): Promise<TestCaseItem[]> {
    const data = await request<TestCaseItem[] | { test_cases?: TestCaseItem[]; cases?: TestCaseItem[] }>(
      '/api/test-cases',
    );
    if (Array.isArray(data)) return data;
    return data.test_cases ?? data.cases ?? [];
  },

  sendTestCase(id: string): Promise<ProcessedEmail> {
    return request<ProcessedEmail>(`/api/test-cases/${encodeURIComponent(id)}/send`, {
      method: 'POST',
    });
  },

  async getEmails(): Promise<ProcessedEmail[]> {
    const data = await request<ProcessedEmail[] | { emails?: ProcessedEmail[] }>('/api/emails');
    if (Array.isArray(data)) return data;
    return data.emails ?? [];
  },

  getEmail(id: string): Promise<ProcessedEmail> {
    return request<ProcessedEmail>(`/api/emails/${encodeURIComponent(id)}`);
  },

  sendEmail(payload: { from: string; subject: string; body: string }): Promise<ProcessedEmail> {
    return request<ProcessedEmail>('/api/emails', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  takeoverCase(caseId: string, csr = 'GolfPM CSR'): Promise<ProcessedEmail | Record<string, unknown>> {
    return request(`/api/cases/${encodeURIComponent(caseId)}/takeover`, {
      method: 'POST',
      body: JSON.stringify({ csr }),
    });
  },

  async getReviewQueue(): Promise<ReviewQueueItem[]> {
    const data = await request<
      ReviewQueueItem[] | { queue?: ReviewQueueItem[]; items?: ReviewQueueItem[] }
    >('/api/review-queue');
    if (Array.isArray(data)) return data;
    return data.queue ?? data.items ?? [];
  },

  submitReviewDecision(
    id: string,
    payload: { decision: 'approve' | 'edit' | 'reject'; body: string },
  ): Promise<Record<string, unknown>> {
    return request(`/api/review/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMetrics(): Promise<MetricsResponse> {
    return request<MetricsResponse>('/api/metrics');
  },

  getConfig(): Promise<AgentConfig> {
    return request<AgentConfig>('/api/config');
  },

  updateConfig(partial: Record<string, unknown>): Promise<AgentConfig> {
    return request<AgentConfig>('/api/config', {
      method: 'PUT',
      body: JSON.stringify(partial),
    });
  },

  runEvaluation(file: 'test_cases.json' | 'synthetic_cases.json'): Promise<EvaluationRunResponse> {
    return request<EvaluationRunResponse>(
      `/api/evaluation/run?file=${encodeURIComponent(file)}`,
      { method: 'POST' },
    );
  },

  generateSynthetic(perCategory = 10): Promise<SyntheticGenerateResponse> {
    return request<SyntheticGenerateResponse>(
      `/api/synthetic/generate?per_category=${encodeURIComponent(String(perCategory))}`,
      { method: 'POST' },
    );
  },
};
