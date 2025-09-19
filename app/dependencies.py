from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from .sdk.seven_ma_sdk import SevenPaceAsyncClient, AuthenticationError, UserInfo
from .cache import user_info_cache

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token") # tokenUrl is not used directly, but required

async def get_authenticated_client(token: str = Depends(oauth2_scheme)) -> SevenPaceAsyncClient:
    """
    Dependency to get an authenticated SevenPaceAsyncClient.
    It uses a cache to avoid excessive calls to get_user_info.
    """
    client = SevenPaceAsyncClient()
    client.set_token(token)

    # 尝试从缓存中获取用户信息
    cached_user_info = user_info_cache.get(token)
    if cached_user_info:
        # 如果缓存命中，我们可以通过重写 get_user_info 方法来避免实际的 API 调用
        async def cached_get_user_info(*args, **kwargs) -> UserInfo:
            return cached_user_info
        client.get_user_info = cached_get_user_info # type: ignore
        return client

    # 如果缓存未命中，则执行实际的 API 调用
    try:
        user_info = await client.get_user_info()
        # 将获取到的用户信息存入缓存
        user_info_cache.set(token, user_info)
        return client
    except (AuthenticationError, Exception) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

# Note: The client returned by this dependency is not closed automatically.
# We need to handle its lifecycle within the endpoint or using another dependency.
# For simplicity in this project, we will rely on the endpoint to close it,
# or let the garbage collector handle it as each request creates a new client.
