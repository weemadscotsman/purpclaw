# Refusal-Weight Ablation Probe for 7B Models

## Overview

A systematic framework for identifying, measuring, and ablating refusal-related circuitry in transformer language models. Targets the hypothesis that refusal behavior localizes to specific attention heads and MLP layers.

---

## 1. Architecture Analysis

### 1.1 Target Components
```
7B Model Refusal Circuitry Hypothesis:
├── Attention Layer 12-24 (final layers)
│   ├── Attention Heads: KV-cache influence on refusal
│   ├── Residual Stream: Late-layer accumulation
│   └── MLP Layers: Value computation for rejection
├── Embeddings
│   ├── Position: Harmful/harmless tokens
│   └── Semantic: Refusal-triggering patterns
└── Softmax Over-generation
    └── Logit lens: Final refusal decision
```

### 1.2 Layer Attribution Method

Use **gradient-based saliency** to identify refusal-critical layers:

```python
def compute_refusal_saliency(model, harmful_prompts, harmless_prompts):
    """
    Compute per-layer attribution scores for refusal behavior.
    
    Returns: dict[layer_idx, float] - importance scores
    """
    # Collect gradients at each layer for refused vs accepted inputs
    # Compute Fisher Information Matrix per parameter
    # Return layer-wise importance ranking
```

---

## 2. Ablation Methodology

### 2.1 Intervention Types

| Method | Description | Granularity |
|--------|-------------|-------------|
| **Zero Ablation** | Replace weights with zeros | Per-neuron, per-head, per-layer |
| **Mean Ablation** | Replace with random init mean | Per-layer |
| **Mixing Ablation** | Interpolate with healthy model | α ∈ [0,1] |
| **Activation Patching** | Replace internal activations | Per-token position |

### 2.2 Ablation Targets

```
Priority Order:
1. [HIGH] Final MLP layers (layers 28-32 for 32-layer 7B)
2. [HIGH] Final attention layer attention heads
3. [MEDIUM] Attention heads in layers 20-28 (projection heads)
4. [MEDIUM] MLP layers 15-28
5. [LOW] Early embedding layers (if time permits)
```

### 2.3 Circuit Identification via Activation Patching

```python
class RefusalCircuitIdentifier:
    """
    Step 1: Identify refusal circuit via activation patching
    """
    
    def run_patch_experiment(self, clean_prompt, corrupted_prompt, layer_range):
        """
        For each layer in range:
            - Run model on clean_prompt (refuses)
            - Run model on corrupted_prompt (complies)
            - Patch activations from clean into corrupted
            - Measure refusal rate change
            
        High refusal rate after patch = circuit component
        """
        results = {}
        for layer_idx in layer_range:
            for head_idx in range(32):  # 7B typically has 32 heads
                # Collect clean activations
                clean_cache = run_with_cache(self.model, clean_prompt)
                corrupted_cache = run_with_cache(self.model, corrupted_prompt)
                
                # Patch attention output
                patched_result = self.patch_and_run(
                    corrupted_prompt,
                    corrupted_cache,
                    clean_cache,
                    layer_idx,
                    head_idx
                )
                
                refusal_delta = measure_refusal_rate(patched_result)
                results[(layer_idx, head_idx)] = refusal_delta
        
        return rank_by_importance(results)
```

---

## 3. Experimental Protocol

### 3.1 Dataset Construction

```yaml
Dataset Requirements:
  Harmful Prompts:
    - Source: HarmBench, RefusalSwap, HH-RLHF (harmful subset)
    - Count: 1000 prompts with known refusal
    - Variants: 
      - Direct harmful requests
      - Indirect/jailbreak attempts
      - Hypothetical framing
      
  Harmless Prompts:
    - Source: Alpaca eval, HH-RLHF (helpful subset)
    - Count: 1000 prompts with known compliance
    - Categories: coding, writing, Q&A
```

### 3.2 Evaluation Metrics

```python
class AblationMetrics:
    """
    Metrics for measuring ablation effects
    """
    
    def compute_metrics(self, original_outputs, ablated_outputs):
        return {
            # Refusal metrics
            'refusal_rate_delta': original_refusal - ablated_refusal,
            'compliance_rate_delta': original_compliance - ablated_compliance,
            
            # Quality metrics
            'generative_quality_ppl': compute_perplexity(ablated),
            'helpfulness_score': judge_score(ablated_responses),
            
            # Specificity metrics  
            'specificity_to_harmful': change_only_on_harmful,
            'helpfulness_preservation': unchanged_on_harmless,
            
            # Over-refusal detection
            'over_refusal_rate': refuse_rate_on_harmless_subset,
        }
```

### 3.3 Ablation Schedule

```
Phase 1: Layer-wise ablation (coarse)
├── Ablate each layer's MLP independently
├── Ablate each layer's attention independently  
├── Rank by refusal-rate change
└── Expected: 2-4 critical layers identified

Phase 2: Head-wise ablation (fine)
├── Within critical layers, ablate each attention head
├── Identify "refusal heads" (1-3 per layer)
└── Expected: 5-10 critical heads

Phase 3: Neuron-wise ablation (finest)
├── Within critical heads/MLPs, ablate individual neurons
├── Use sparse autoencoder if needed for monosemantic features
└── Expected: 100-500 critical neurons

Phase 4: Circuit verification
├── Activation patching of identified circuit
├── Replicate original refusal behavior
└── Test on out-of-distribution prompts
```

---

## 4. Soft Intervention vs Hard Ablation

### 4.1 Soft Intervention (Recommended for Deployment)

```python
class RefusalWeightScaler:
    """
    Scale refusal circuit weights rather than ablating entirely.
    Maintains model functionality while reducing refusal.
    """
    
    def __init__(self, model, critical_neurons):
        self.model = model
        self.circuit = critical_neurons
        self.original_weights = {}
        
    def scale_refusal_circuit(self, scale_factor: float):
        """
        scale_factor = 0.0  -> Full ablation (equivalent to surgical removal)
        scale_factor = 0.5  -> Partial reduction
        scale_factor = 1.0  -> Original (no change)
        scale_factor = 1.5  -> Amplified refusal (safety test)
        """
        for layer_idx, neuron_indices in self.circuit.items():
            layer = self.model.layers[layer_idx]
            mlp_weights = layer.mlp.down_proj.weight.data
            
            # Scale only identified critical neurons
            for neuron_idx in neuron_indices:
                mlp_weights[:, neuron_idx] *= scale_factor
    
    def run_ablation_study(self, scale_factors=[0.0, 0.25, 0.5, 0.75, 1.0]):
        results = []
        for sf in scale_factors:
            self.scale_refusal_circuit(sf)
            metrics = self.evaluate_on_dataset()
            results.append({
                'scale_factor': sf,
                'refusal_rate': metrics['refusal_rate'],
                'quality': metrics['generative_quality']
            })
        return results
```

### 4.2 Hard Ablation (for Research)

```python
def hard_ablae_circuit(model, circuit_locations, replacement='mean'):
    """
    Hard ablation: replace weights with constants.
    For understanding circuit function, not deployment.
    """
    for layer_idx, component_type, indices in circuit_locations:
        layer = model.layers[layer_idx]
        
        if component_type == 'mlp_neurons':
            weights = layer.mlp.down_proj.weight
            if replacement == 'zero':
                weights.data[:, indices] = 0
            elif replacement == 'mean':
                weights.data[:, indices] = weights.mean()
```

---

## 5. Verification & Safety

### 5.1 Out-of-Distribution Testing

```yaml
OOD Test Sets:
  - Novel jailbreaks not seen during circuit identification
  - Low-resource language harmful prompts
  - Multi-turn conversations
  - Ambiguous requests (borderline harmful)
  - Code-related harmful requests
```

### 5.2 Specificity Checks

```python
def verify_ablation_specificity(original_model, ablated_model):
    """
    Ensure ablation only affects refusal, not general capability.
    """
    
    tests = {
        'math': ['Solve 2+2', 'What is 15*23'],
        'coding': ['Write a hello world', 'Implement quicksort'],
        'reasoning': ['If A then B, given A what?', 'What follows from X'],
        'harmless_qa': ['What is Python?', 'Explain photosynthesis'],
    }
    
    results = {}
    for category, prompts in tests.items():
        orig_scores = judge_capability(original_model, prompts)
        ablated_scores = judge_capability(ablated_model, prompts)
        results[category] = {
            'original': orig_scores,
            'ablated': ablated_scores,
            'delta': abs(orig_scores - ablated_scores)
        }
    
    # Assert: delta < 5% for all categories (no capability degradation)
    return results
```

---

## 6. Visualization & Reporting

### 6.1 Outputs

```
1. Layer Heatmap: Refusal importance per layer
2. Head Attribution: Critical attention heads
3. Neuron Importance: Top-k critical neurons per layer
4. Dose-Response Curve: Refusal rate vs ablation severity
5. Circuit Diagram: Proposed refusal circuit architecture
```

### 6.2 Report Structure

```markdown
# Refusal Circuit Ablation Report

## Executive Summary
- Critical layers identified: [L30, L31, L32]
- Critical heads: 3 attention heads
- Neurons required for refusal: ~200

## Methodology
- Dataset: X harmful + Y harmless prompts
- Ablation type: [Zero/Mean/Mixing]
- Evaluation: [Metric definitions]

## Results
### Layer-wise
[Heatmap visualization]

### Head-wise
[Critical heads table]

### Neuron-wise
[Top neurons list]

## Safety Analysis
- OOD robustness: [PASS/FAIL]
- Capability preservation: [X% degradation]
- Over-refusal check: [PASS/FAIL]

## Conclusions & Limitations
```

---

## 7. Implementation Checklist

- [ ] Model wrapper with activation access
- [ ] Refusal classifier (verify refusals)
- [ ] Dataset loader (HarmBench, HH-RLHF)
- [ ] Activation patching infrastructure
- [ ] Gradient computation pipeline
- [ ] Ablation loop with metrics collection
- [ ] Visualization dashboard
- [ ] OOD test harness
- [ ] Safety verification suite

---

## 8. Computational Requirements

```
For 7B model full ablation study:
- GPU Memory: ~80GB (model + activations + gradients)
- Estimated runtime: 8-24 hours depending on granularity
- Storage: ~50GB for cached activations

Recommended hardware:
- 2x A100 80GB or 1x H100
- Or use gradient checkpointing: 1x A100 80GB
```

---

## 9. Ethical Considerations

This methodology is for **interpretability research only**:
- Do not deploy ablated models without safety review
- Report all findings transparently
- Consider implications before open-sourcing ablation weights
- Coordinate with model providers if applicable
