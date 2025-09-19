from fastapi import APIRouter, Depends
from ..sdk.seven_ma_sdk import SevenPaceAsyncClient, UserInfo
from ..dependencies import get_authenticated_client

router = APIRouter()

@router.get("", response_model=dict)
async def get_user_info(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    获取当前登录用户的信息
    """
    try:
        user_info = await client.get_user_info(need_credits=True)
        return dict(user_info)
    finally:
        await client.close()
