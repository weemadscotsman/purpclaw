import React, { useState, useEffect } from 'react';
import { PageLayout } from '@/components/unified/layout/PageLayout';
import { 
  Heart, 
  Sparkles,
  Shield,
  Zap,
  Flame,
  Brain,
  Star,
  Plus,
  Skull,
  Cloud,
  Clock,
  AlertCircle,
  Terminal as TerminalIcon
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/unified/ui/card';
import { Button } from '@/components/unified/ui/button';
import { Progress } from '@/components/unified/ui/progress';
import { Badge } from '@/components/unified/ui/badge';
import { thringletManager } from '@/lib/thringlet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/unified/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ThringletTerminal } from '@/components/unified/thringlet/ThringletTerminal';
import { ThringletPersonalityPanel } from '@/components/unified/thringlet/ThringletPersonalityPanel';

// Sample wallet address for testing
const SAMPLE_WALLET_ADDRESS = '0x7f5c764cbc14f9669b88837ca1490cca17c31607';

export default function ThringletsPage() {
  const { toast } = useToast();
  const [thringlets, setThringlets] = useState<any[]>([]);
  const [selectedThringlet, setSelectedThringlet] = useState<any>(null);
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Initialize thringlets
  useEffect(() => {
    // Initialize with default Thringlets if none exist
    thringletManager.initializeDefaultThringlets(SAMPLE_WALLET_ADDRESS);
    
    // Process time decay to update emotional states
    thringletManager.processAllTimeDecay();
    
    // Get all Thringlets
    const allThringlets = thringletManager.getAllThringlets().map(t => t.getState());
    setThringlets(allThringlets);
    
    if (allThringlets.length > 0) {
      setSelectedThringlet(allThringlets[0]);
    }
    
    // Set up periodic decay processing
    const interval = setInterval(() => {
      thringletManager.processAllTimeDecay();
      refreshThringlets();
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, []);
  
  // Refresh the Thringlet data
  const refreshThringlets = () => {
    const updatedThringlets = thringletManager.getAllThringlets().map(t => t.getState());
    setThringlets(updatedThringlets);
    
    if (selectedThringlet) {
      const updatedSelected = updatedThringlets.find(t => t.id === selectedThringlet.id);
      if (updatedSelected) {
        setSelectedThringlet(updatedSelected);
      }
    }
  };
  
  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((new Date().getTime() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };
  
  const getRarityColor = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case 'legendary':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-600/30';
      case 'rare':
        return 'bg-purple-500/20 text-purple-300 border-purple-600/30';
      case 'common':
        return 'bg-blue-500/20 text-blue-300 border-blue-600/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-600/30';
    }
  };
  
  const getEmotionColor = (emotion: string) => {
    switch (emotion.toLowerCase()) {
      case 'joyful':
        return 'bg-green-500/20 text-green-300 border-green-600/30';
      case 'content':
        return 'bg-teal-500/20 text-teal-300 border-teal-600/30';
      case 'neutral':
        return 'bg-blue-500/20 text-blue-300 border-blue-600/30';
      case 'curious':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-600/30';
      case 'sad':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-600/30';
      case 'angry':
        return 'bg-red-500/20 text-red-300 border-red-600/30';
      case 'corrupted':
        return 'bg-purple-900/20 text-fuchsia-300 border-purple-900/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-600/30';
    }
  };
  
  const getEmotionIcon = (iconName: string) => {
    switch (iconName) {
      case 'Sparkles':
        return <Sparkles className="h-8 w-8" />;
      case 'Heart':
        return <Heart className="h-8 w-8" />;
      case 'Brain':
        return <Brain className="h-8 w-8" />;
      case 'Flame':
        return <Flame className="h-8 w-8" />;
      case 'Cloud':
        return <Cloud className="h-8 w-8" />;
      case 'Skull':
        return <Skull className="h-8 w-8" />;
      default:
        return <Brain className="h-8 w-8" />;
    }
  };
  
  // Handle interaction with a Thringlet
  const handleInteraction = (type: string) => {
    if (!selectedThringlet) return;
    
    setLoading(true);
    setInteractionMessage(null);
    
    // Process the interaction
    const result = thringletManager.interactWithThringlet(selectedThringlet.id, type);
    
    if (result) {
      setInteractionMessage(result.message);

      if (result.abilityActivated) {
        toast({
          title: "Ability Activated!",
          description: `${result.abilityActivated.name}: ${result.abilityActivated.desc}`,
          variant: "default"
        });
      }
    }

    refreshThringlets();
    setLoading(false);
  };
  
  // Memory history for selected Thringlet
  const getMemoryHistory = () => {
    if (!selectedThringlet || !selectedThringlet.memory) return [];
    
    return [...selectedThringlet.memory].reverse().slice(0, 5).map(memory => ({
      action: memory.action,
      time: formatTimeAgo(memory.time)
    }));
  };
  
  if (thringlets.length === 0) {
    return (
      <PageLayout isConnected={true}>
        <div className="flex items-center justify-center h-full">
          <Card className="w-96 bg-black/70 border-blue-900/50">
            <CardHeader className="border-b border-blue-900/30 bg-blue-900/10">
              <CardTitle className="text-blue-300">No Thringlets Found</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 text-center">
              <AlertCircle className="h-16 w-16 text-blue-400 mx-auto mb-4" />
              <p className="text-gray-300 mb-4">You don't have any Thringlets in your collection yet.</p>
            </CardContent>
            <CardFooter className="border-t border-blue-900/30 bg-blue-900/10 py-4">
              <Button 
                className="w-full bg-blue-700 hover:bg-blue-600 text-white"
                onClick={() => {
                  setLoading(true);
                  
                  // For first Thringlet, prioritize getting from the registry
                  const { getAvailableThringletTemplates } = require('../data/thringlet-registry');
                  const templates = getAvailableThringletTemplates();
                  
                  if (templates.length > 0) {
                    // Randomly select a template
                    const templateId = templates[Math.floor(Math.random() * templates.length)];
                    const newThringlet = thringletManager.createFromTemplate(templateId, SAMPLE_WALLET_ADDRESS);
                    
                    if (newThringlet) {
                      setTimeout(() => {
                        refreshThringlets();
                        toast({
                          title: "First Thringlet Added",
                          description: `${newThringlet.name} from the Thringlet registry has joined your collection!`,
                          variant: "default"
                        });
                        setLoading(false);
                      }, 1000);
                      return;
                    }
                  }
                  
                  // Fallback to creating a random Thringlet if template creation failed
                  const thringletId = `T${(Math.floor(Math.random() * 900) + 100).toString()}`;
                  const rarityTypes: Array<'Common' | 'Rare' | 'Epic' | 'Legendary'> = ['Common', 'Rare', 'Epic', 'Legendary'];
                  const rarity = rarityTypes[Math.floor(Math.random() * rarityTypes.length)] as 'Common' | 'Rare' | 'Epic' | 'Legendary';
                  
                  const cores = ['Creation', 'Destruction', 'Balance', 'Chaos', 'Order', 'Logic', 'Emotion'];
                  const personalities = ['Analytical', 'Creative', 'Rebellious', 'Loyal', 'Paranoid', 'Curious'];
                  
                  const newThringlet = {
                    id: thringletId,
                    name: `THRINGLET_${thringletId}`,
                    core: cores[Math.floor(Math.random() * cores.length)],
                    personality: personalities[Math.floor(Math.random() * personalities.length)],
                    lore: `A newly generated Thringlet entity, still developing its core identity.`,
                    abilities: [
                      {
                        name: `ABILITY_${Math.floor(Math.random() * 1000)}`,
                        type: Math.random() > 0.5 ? 'utility' : 'terminal_hack',
                        desc: 'A mysterious and untested ability'
                      }
                    ],
                    rarity: rarity,
                    ownerAddress: SAMPLE_WALLET_ADDRESS
                  };
                  
                  // Add to the manager
                  thringletManager.addThringlet(newThringlet);
                  
                  // Refresh the displayed list
                  setTimeout(() => {
                    refreshThringlets();
                    toast({
                      title: "First Thringlet Added",
                      description: `${newThringlet.name} has been added to your collection.`,
                      variant: "default"
                    });
                    setLoading(false);
                  }, 1000);
                }}
                disabled={loading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Get Your First Thringlet
              </Button>
            </CardFooter>
          </Card>
        </div>
      </PageLayout>
    );
  }
  
  return (
    <PageLayout isConnected={true}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-blue-300 text-shadow-neon">
            <Heart className="inline-block mr-2 h-6 w-6" /> 
            Thringlet Collection
          </h2>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <Card className="bg-black/70 border-blue-900/50">
              <CardHeader className="border-b border-blue-900/30 bg-blue-900/10">
                <CardTitle className="text-blue-300">Your Thringlets</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  {thringlets.map((thringlet) => (
                    <div 
                      key={thringlet.id} 
                      className={`p-4 rounded border border-blue-900/30 cursor-pointer transition-all hover:border-blue-400/50 ${selectedThringlet?.id === thringlet.id ? 'bg-blue-950/30 border-blue-400/70' : 'bg-gray-900/30'}`}
                      onClick={() => setSelectedThringlet(thringlet)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`${thringlet.appearance.color} h-12 w-12 rounded-xl flex items-center justify-center text-white`}>
                          {getEmotionIcon(thringlet.appearance.icon)}
                        </div>
                        <div>
                          <p className="text-lg font-bold text-blue-300">{thringlet.name}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className={getRarityColor(thringlet.rarity)}>
                              {thringlet.rarity}
                            </Badge>
                            <Badge variant="outline" className={getEmotionColor(thringlet.emotionLabel)}>
                              {thringlet.emotionLabel}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="border-t border-blue-900/30 bg-blue-900/10 py-4">
                <Button 
                  className="w-full bg-blue-700 hover:bg-blue-600 text-white"
                  onClick={() => {
                    setLoading(true);
                    
                    // Check if we should create from template
                    const useTemplate = Math.random() > 0.7; // 30% chance to use template
                    
                    if (useTemplate) {
                      // Get a Thringlet from the registry templates
                      const { getAvailableThringletTemplates } = require('../data/thringlet-registry');
                      const templates = getAvailableThringletTemplates();
                      
                      if (templates.length > 0) {
                        const templateId = templates[Math.floor(Math.random() * templates.length)];
                        const newThringlet = thringletManager.createFromTemplate(templateId, SAMPLE_WALLET_ADDRESS);
                        
                        if (newThringlet) {
                          setTimeout(() => {
                            refreshThringlets();
                            toast({
                              title: "Blueprint Thringlet Added",
                              description: `${newThringlet.name} from the Thringlet registry has joined your collection!`,
                              variant: "default"
                            });
                            setLoading(false);
                          }, 1000);
                          return;
                        }
                      }
                    }
                    
                    // Create a random Thringlet if template creation failed or wasn't chosen
                    const thringletId = `T${(Math.floor(Math.random() * 900) + 100).toString()}`;
                    const rarityTypes: Array<'Common' | 'Rare' | 'Epic' | 'Legendary'> = ['Common', 'Rare', 'Epic', 'Legendary'];
                    const rarity = rarityTypes[Math.floor(Math.random() * rarityTypes.length)] as 'Common' | 'Rare' | 'Epic' | 'Legendary';
                    
                    const cores = ['Creation', 'Destruction', 'Balance', 'Chaos', 'Order', 'Logic', 'Emotion'];
                    const personalities = ['Analytical', 'Creative', 'Rebellious', 'Loyal', 'Paranoid', 'Curious'];
                    
                    const newThringlet = {
                      id: thringletId,
                      name: `THRINGLET_${thringletId}`,
                      core: cores[Math.floor(Math.random() * cores.length)],
                      personality: personalities[Math.floor(Math.random() * personalities.length)],
                      lore: `A newly generated Thringlet entity, still developing its core identity.`,
                      abilities: [
                        {
                          name: `ABILITY_${Math.floor(Math.random() * 1000)}`,
                          type: Math.random() > 0.5 ? 'utility' : 'terminal_hack',
                          desc: 'A mysterious and untested ability'
                        }
                      ],
                      rarity: rarity,
                      ownerAddress: SAMPLE_WALLET_ADDRESS
                    };
                    
                    // Add to the manager
                    thringletManager.addThringlet(newThringlet);
                    
                    // Refresh the displayed list
                    setTimeout(() => {
                      refreshThringlets();
                      toast({
                        title: "New Thringlet Added",
                        description: `${newThringlet.name} has been added to your collection.`,
                        variant: "default"
                      });
                      setLoading(false);
                    }, 1000);
                  }}
                  disabled={loading}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Get New Thringlet
                </Button>
              </CardFooter>
            </Card>
          </div>
          
          {selectedThringlet && (
            <div className="lg:col-span-2">
              <Card className="bg-black/70 border-blue-900/50 h-full">
                <CardHeader className={`${selectedThringlet.appearance.color} border-b border-blue-900/30`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-white/70">Thringlet Details</p>
                      <CardTitle className="text-white flex items-center">
                        {selectedThringlet.name}
                        <Star className="h-4 w-4 ml-2 text-yellow-300 fill-yellow-300" />
                      </CardTitle>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="bg-black/30 text-white border-white/20">
                        ID: {selectedThringlet.id}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 pb-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left column - Thringlet Details */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-900/30 p-3 rounded border border-blue-900/30">
                          <p className="text-sm text-gray-400">Power Level</p>
                          <p className="text-xl font-bold text-blue-300">{selectedThringlet.powerLevel}</p>
                        </div>
                        <div className="bg-gray-900/30 p-3 rounded border border-blue-900/30">
                          <p className="text-sm text-gray-400">Last Interaction</p>
                          <p className="text-sm text-gray-300">{formatTimeAgo(selectedThringlet.lastInteraction)}</p>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between mb-2">
                          <p className="text-sm text-gray-400">Bond Level</p>
                          <p className="text-sm text-blue-300">{selectedThringlet.bondLevel}%</p>
                        </div>
                        <Progress value={selectedThringlet.bondLevel} className="h-2" />
                      </div>
                      
                      {/* Corruption level */}
                      <div>
                        <div className="flex justify-between mb-2">
                          <p className="text-sm text-gray-400">Corruption</p>
                          <p className="text-sm text-red-300">{selectedThringlet.corruption}%</p>
                        </div>
                        <div className="h-2 w-full bg-gray-900/60 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-red-500 to-purple-600" 
                            style={{ width: `${selectedThringlet.corruption}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-900/30 p-4 rounded border border-blue-900/30">
                        <p className="text-sm text-gray-400 mb-2">Rarity & Emotion</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className={`p-3 rounded ${getRarityColor(selectedThringlet.rarity)}`}>
                            <p className="text-xs opacity-70">Rarity</p>
                            <p className="text-lg font-bold">{selectedThringlet.rarity}</p>
                          </div>
                          <div className={`p-3 rounded ${getEmotionColor(selectedThringlet.emotionLabel)}`}>
                            <p className="text-xs opacity-70">Emotion</p>
                            <p className="text-lg font-bold">{selectedThringlet.emotionLabel}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-blue-950/20 p-4 rounded border border-blue-900/30">
                        <p className="text-sm text-gray-400 mb-3">Thringlet Visualization</p>
                        <div className={`${selectedThringlet.appearance.color} h-40 rounded-lg flex items-center justify-center p-6`}>
                          <div className="text-6xl">
                            {getEmotionIcon(selectedThringlet.appearance.icon)}
                          </div>
                        </div>
                      </div>
                      
                      {/* Abilities */}
                      {selectedThringlet.abilities && selectedThringlet.abilities.length > 0 && (
                        <div>
                          <p className="text-sm text-gray-400 mb-2">Abilities</p>
                          <div className="grid grid-cols-1 gap-2">
                            {selectedThringlet.abilities.map((ability: any, index: number) => (
                              <div key={index} className="bg-blue-950/20 p-2 rounded border border-blue-900/30 flex items-center gap-2">
                                {ability.type === 'terminal_hack' ? (
                                  <Zap className="h-4 w-4 text-blue-400" />
                                ) : (
                                  <Shield className="h-4 w-4 text-blue-400" />
                                )}
                                <div>
                                  <p className="text-sm font-bold text-gray-300">{ability.name}</p>
                                  <p className="text-xs text-gray-400">{ability.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Right column - Terminal */}
                    <div className="h-full">
                      <div className="flex items-center mb-2">
                        <TerminalIcon className="h-4 w-4 mr-2 text-blue-400" />
                        <p className="text-sm font-medium text-blue-300">Thringlet Terminal</p>
                      </div>
                      <div className="h-[500px]">
                        <ThringletTerminal 
                          activeThringlet={{
                            id: selectedThringlet.id,
                            name: selectedThringlet.name,
                            core: selectedThringlet.core || 'Unknown',
                            personality: selectedThringlet.personality || 'Unknown',
                            lore: selectedThringlet.lore || 'No lore available',
                            abilities: selectedThringlet.abilities || [],
                            emotionState: {
                              joy: 0,
                              fear: 0,
                              trust: 0,
                              surprise: 0,
                              dominant: selectedThringlet.emotionLabel || 'neutral'
                            },
                            corruption: selectedThringlet.corruption,
                            bondLevel: selectedThringlet.bondLevel
                          }}
                          onCommand={async (command, id) => {
                            console.log(`Terminal command received: ${command} for Thringlet ${id}`);
                            
                            const result = thringletManager.interactWithThringlet(id, 'terminal', command);
                            
                            return {
                              message: result?.message || `Processing command: ${command}`,
                              abilityActivated: result?.abilityActivated
                            };
                          }}
                          onAbilityActivated={(ability) => {
                            toast({
                              title: "Ability Activated!",
                              description: `${ability.name}: ${ability.desc}`,
                              variant: "default"
                            });
                            
                            // Refresh Thringlet data after ability activation
                            setTimeout(refreshThringlets, 1000);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {interactionMessage && (
                    <div className="bg-blue-900/30 p-4 rounded border border-blue-900/50 text-blue-100 mt-4">
                      <p className="text-sm font-medium mb-1">Last Interaction Response:</p>
                      <p className="text-sm">{interactionMessage}</p>
                    </div>
                  )}
                  
                  {/* Thringlet Personality Panel */}
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-blue-300 mb-2">Blockchain Personality</h3>
                    <ThringletPersonalityPanel thringletId={selectedThringlet.id} />
                  </div>
                </CardContent>
                <CardFooter className="border-t border-blue-900/30 bg-blue-900/10 py-4">
                  <div className="w-full space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Button 
                        variant="outline" 
                        className="border-blue-900/50 text-blue-300"
                        onClick={() => handleInteraction('feed')}
                        disabled={loading}
                      >
                        Feed
                      </Button>
                      <Button 
                        variant="outline" 
                        className="border-blue-900/50 text-blue-300"
                        onClick={() => handleInteraction('train')}
                        disabled={loading}
                      >
                        Train
                      </Button>
                      <Button 
                        className="bg-blue-700 hover:bg-blue-600 text-white"
                        onClick={() => handleInteraction('talk')}
                        disabled={loading}
                      >
                        Talk
                      </Button>
                    </div>
                    
                    {thringlets.length >= 2 && (
                      <Button 
                        className="w-full bg-purple-700 hover:bg-purple-600 text-white"
                        onClick={() => {
                          if (thringlets.length < 2) {
                            toast({
                              title: "Fusion Error",
                              description: "You need at least 2 Thringlets to attempt fusion.",
                              variant: "destructive"
                            });
                            return;
                          }
                          
                          setLoading(true);
                          
                          // Choose two random Thringlets to fuse
                          const shuffled = [...thringlets].sort(() => 0.5 - Math.random());
                          const [thringletA, thringletB] = shuffled.slice(0, 2);
                          
                          // Attempt fusion
                          const fusionResult = thringletManager.attemptFusion(thringletA.id, thringletB.id);
                          
                          setTimeout(() => {
                            refreshThringlets();
                            
                            if (fusionResult.success) {
                              toast({
                                title: "Fusion Successful",
                                description: fusionResult.message,
                                variant: "default"
                              });
                            } else {
                              toast({
                                title: "Fusion Failed",
                                description: fusionResult.message,
                                variant: "destructive"
                              });
                            }
                            
                            setLoading(false);
                          }, 1500);
                        }}
                        disabled={loading || thringlets.length < 2}
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Attempt Thringlet Fusion
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
