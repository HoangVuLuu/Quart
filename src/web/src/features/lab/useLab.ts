import { useMutation, useQuery } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../lib/api/client';

export type LabScenario = Schemas['LabScenario'];
export type GeneratorInput = Schemas['GeneratorInput'];
export type GeneratorResult = Schemas['GeneratorResult'];

export function usePresoteaScenario() {
  return useQuery({
    queryKey: ['lab', 'scenario', 'presotea'],
    queryFn: ({ signal }) => unwrap(api.GET('/api/lab/scenarios/presotea', { signal })),
    // The sample never changes while the page is open.
    staleTime: Infinity,
  });
}

export function useGenerate() {
  return useMutation({
    mutationFn: (input: GeneratorInput) => unwrap(api.POST('/api/lab/generate', { body: input })),
  });
}
