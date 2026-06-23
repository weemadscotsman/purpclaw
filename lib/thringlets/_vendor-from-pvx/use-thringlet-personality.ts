import { useQuery, useMutation } from '@tanstack/react-query';
import { ThringletPersonalityTrait } from '@shared/types';
import { BlockchainAffinity } from '@/types/blockchain';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

interface ThringletPersonality {
  id: string;
  personalityTraits: ThringletPersonalityTrait[];
  dominantTrait: ThringletPersonalityTrait;
  blockchainAffinities: BlockchainAffinity[];
  dominantAffinity: BlockchainAffinity;
  traitIntensity: Record<ThringletPersonalityTrait, number>;
  miningInfluence: number;
  stakingInfluence: number;
  tradingInfluence: number;
  governanceInfluence: number;
}

interface PersonalizedResponse {
  id: string;
  input: string;
  response: string;
  personality: {
    dominantTrait: ThringletPersonalityTrait;
    dominantAffinity: BlockchainAffinity;
  };
}

interface PersonalityUpdateResult {
  id: string;
  message: string;
  updated: boolean;
  changes?: {
    dominantTrait: boolean;
    emotionalState: boolean;
    experience: boolean;
  };
}

export function useThringletPersonality(thringletId?: string) {
  const { toast } = useToast();

  // Get thringlet personality
  const {
    data: personality,
    isLoading: isLoadingPersonality,
    error: personalityError,
    refetch: refetchPersonality
  } = useQuery<ThringletPersonality>({
    queryKey: ['/api/thringlet/personality', thringletId],
    enabled: !!thringletId,
  });

  // Update personality based on blockchain activity
  const updatePersonalityMutation = useMutation<PersonalityUpdateResult, Error, { thringletId: string }>({
    mutationFn: async ({ thringletId }) => {
      const response = await fetch('/api/thringlet/update-personality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thringletId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update personality');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.updated) {
        toast({
          title: 'Personality Updated',
          description: data.message,
          variant: 'default',
        });
        
        // Invalidate personality data
        queryClient.invalidateQueries({ queryKey: ['/api/thringlet/personality', thringletId] });
        
        // Invalidate status as well if emotional state changed
        if (data.changes?.emotionalState) {
          queryClient.invalidateQueries({ queryKey: ['/api/thringlet/status', thringletId] });
        }
      } else {
        toast({
          title: 'No Changes',
          description: data.message,
          variant: 'default',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Personality Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Get personalized response
  const getPersonalizedResponseMutation = useMutation<PersonalizedResponse, Error, { thringletId: string, input: string }>({
    mutationFn: async ({ thringletId, input }) => {
      const response = await fetch('/api/thringlet/personality-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thringletId, input })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get personalized response');
      }
      
      return response.json();
    },
    onError: (error) => {
      toast({
        title: 'Response Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Get a colored badge based on trait
  const getTraitColor = (trait: ThringletPersonalityTrait): string => {
    const traitColors: Record<ThringletPersonalityTrait, string> = {
      [ThringletPersonalityTrait.ANALYTICAL]: 'bg-blue-500',
      [ThringletPersonalityTrait.ADVENTUROUS]: 'bg-orange-500',
      [ThringletPersonalityTrait.CAUTIOUS]: 'bg-yellow-500',
      [ThringletPersonalityTrait.CREATIVE]: 'bg-purple-500',
      [ThringletPersonalityTrait.SOCIAL]: 'bg-green-500',
      [ThringletPersonalityTrait.CURIOUS]: 'bg-cyan-500',
      [ThringletPersonalityTrait.PROTECTIVE]: 'bg-indigo-500',
      [ThringletPersonalityTrait.CHAOTIC]: 'bg-red-500',
      [ThringletPersonalityTrait.LOGICAL]: 'bg-slate-500',
      [ThringletPersonalityTrait.EMOTIONAL]: 'bg-pink-500'
    };
    
    return traitColors[trait] || 'bg-gray-500';
  };

  // Get a colored badge based on affinity
  const getAffinityColor = (affinity: BlockchainAffinity): string => {
    const affinityColors: Partial<Record<BlockchainAffinity, string>> = {
      [BlockchainAffinity.SECURITY]: 'bg-indigo-500',
      [BlockchainAffinity.PRIVACY]: 'bg-slate-500',
      [BlockchainAffinity.EFFICIENCY]: 'bg-blue-500',
      [BlockchainAffinity.GOVERNANCE]: 'bg-purple-500',
      [BlockchainAffinity.DEFI]: 'bg-green-500',
      [BlockchainAffinity.MINING]: 'bg-amber-500',
      [BlockchainAffinity.STAKING]: 'bg-teal-500',
      [BlockchainAffinity.INNOVATION]: 'bg-fuchsia-500',
      [BlockchainAffinity.COMMUNITY]: 'bg-rose-500',
      [BlockchainAffinity.UTILITY]: 'bg-cyan-500'
    };
    
    return affinityColors[affinity] || 'bg-gray-500';
  };

  return {
    personality,
    isLoadingPersonality,
    personalityError,
    refetchPersonality,
    updatePersonality: (id: string) => updatePersonalityMutation.mutate({ thringletId: id }),
    isUpdatingPersonality: updatePersonalityMutation.isPending,
    getPersonalizedResponse: (id: string, input: string) => 
      getPersonalizedResponseMutation.mutate({ thringletId: id, input }),
    personalizedResponse: getPersonalizedResponseMutation.data?.response,
    isGettingResponse: getPersonalizedResponseMutation.isPending,
    getTraitColor,
    getAffinityColor,
  };
}
