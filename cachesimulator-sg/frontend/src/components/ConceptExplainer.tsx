import './ConceptExplainer.css';

const concepts = [
  {
    term: 'Cache Hit',
    emoji: '✅',
    color: 'var(--accent-green)',
    desc: 'The requested data is found in cache. No main memory access needed — fast!',
  },
  {
    term: 'Cache Miss',
    emoji: '❌',
    color: 'var(--accent-red)',
    desc: 'Data not in cache. Must fetch from a slower level — increases latency significantly.',
  },
  {
    term: 'Associativity',
    emoji: '🗂️',
    color: 'var(--accent-orange)',
    desc: 'How many cache sets a block can map to. Higher = fewer conflict misses, higher cost.',
  },
  {
    term: 'LRU Policy',
    emoji: '🔄',
    color: 'var(--accent-blue)',
    desc: 'Least Recently Used: evicts the block not used for the longest time. Near-optimal in practice.',
  },
  {
    term: 'Block Size',
    emoji: '📦',
    color: 'var(--accent-purple)',
    desc: 'Larger blocks exploit spatial locality but increase miss penalty and waste bandwidth on cold misses.',
  },
  {
    term: 'Memory Traffic',
    emoji: '🚦',
    color: 'var(--accent-cyan)',
    desc: 'Total bytes fetched from main memory. Lower is better — reduces bus contention and power.',
  },
];

export default function ConceptExplainer() {
  return (
    <div className="explainer card">
      <h3>📚 Cache Concepts</h3>
      <div className="concepts-grid">
        {concepts.map((c) => (
          <div key={c.term} className="concept-item" style={{ borderLeft: `3px solid ${c.color}` }}>
            <div className="concept-header">
              <span>{c.emoji}</span>
              <strong style={{ color: c.color }}>{c.term}</strong>
            </div>
            <p>{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
