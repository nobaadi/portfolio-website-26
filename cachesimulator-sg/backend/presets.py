"""
Architecture presets based on real CPUs.
"""
from schemas import ArchitecturePreset, CacheConfig, CacheLevelConfig

PRESETS: list[ArchitecturePreset] = [
    ArchitecturePreset(
        name="Intel Core i7 (Skylake)",
        description="6-core desktop CPU. L1: 32KB/4-way, L2: 256KB/4-way, L3: 9MB/12-way",
        config=CacheConfig(
            L1=CacheLevelConfig(size_kb=32, block_size=64, associativity=4, policy="LRU"),
            L2=CacheLevelConfig(size_kb=256, block_size=64, associativity=4, policy="LRU"),
            L3=CacheLevelConfig(size_kb=9216, block_size=64, associativity=12, policy="LRU"),
        )
    ),
    ArchitecturePreset(
        name="AMD Ryzen 9 (Zen 3)",
        description="High-performance desktop CPU with large L3. L1: 32KB/8-way, L2: 512KB/8-way, L3: 32MB/16-way",
        config=CacheConfig(
            L1=CacheLevelConfig(size_kb=32, block_size=64, associativity=8, policy="LRU"),
            L2=CacheLevelConfig(size_kb=512, block_size=64, associativity=8, policy="LRU"),
            L3=CacheLevelConfig(size_kb=32768, block_size=64, associativity=16, policy="LRU"),
        )
    ),
    ArchitecturePreset(
        name="ARM Cortex-A55 (Mobile)",
        description="Power-efficient mobile core. L1: 16KB/4-way, L2: 64KB/4-way, L3: 512KB/8-way",
        config=CacheConfig(
            L1=CacheLevelConfig(size_kb=16, block_size=64, associativity=4, policy="LRU"),
            L2=CacheLevelConfig(size_kb=64, block_size=64, associativity=4, policy="LRU"),
            L3=CacheLevelConfig(size_kb=512, block_size=64, associativity=8, policy="LRU"),
        )
    ),
    ArchitecturePreset(
        name="Minimal Embedded",
        description="Tiny microcontroller-class cache. L1: 4KB direct-mapped, L2: 16KB/2-way, L3: 64KB/2-way",
        config=CacheConfig(
            L1=CacheLevelConfig(size_kb=4, block_size=32, associativity=1, policy="FIFO"),
            L2=CacheLevelConfig(size_kb=16, block_size=32, associativity=2, policy="LRU"),
            L3=CacheLevelConfig(size_kb=64, block_size=64, associativity=2, policy="LRU"),
        )
    ),
]
