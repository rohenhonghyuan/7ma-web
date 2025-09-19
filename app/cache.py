import time
from typing import Any, Dict, Tuple, Optional
class SimpleCache:
    """
    一个简单的内存缓存实现，带有 TTL (Time-To-Live)。
    """
    def __init__(self, default_ttl: int = 300):
        """
        初始化缓存。
        :param default_ttl: 默认的缓存过期时间（秒）。
        """
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self.default_ttl = default_ttl

    def get(self, key: str) -> Any:
        """
        根据 key 从缓存中获取数据。
        如果 key 不存在或数据已过期，则返回 None。
        """
        if key in self._cache:
            value, expiry_time = self._cache[key]
            if time.time() < expiry_time:
                return value
            else:
                # 缓存过期，删除
                del self._cache[key]
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """
        将数据存入缓存。
        :param key: 缓存键。
        :param value: 缓存值。
        :param ttl: 特定于此条目的过期时间（秒）。如果为 None，则使用默认值。
        """
        if ttl is None:
            ttl = self.default_ttl
        expiry_time = time.time() + ttl
        self._cache[key] = (value, expiry_time)

    def clear(self):
        """
        清空整个缓存。
        """
        self._cache.clear()

# 创建一个全局的用户信息缓存实例
# 缓存时间设置为 5 分钟 (300秒)，这是一个比较合理的折中
user_info_cache = SimpleCache(default_ttl=300)
