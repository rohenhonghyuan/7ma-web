from fastapi import APIRouter, HTTPException
from ..sdk.seven_ma_sdk import SevenPaceAsyncClient, APIError
from .. import models

router = APIRouter()

@router.post("/sms_code", response_model=models.MessageResponse)
async def get_sms_code(request: models.PhoneRequest):
    """
    获取短信验证码
    """
    client = SevenPaceAsyncClient()
    try:
        message = await client.get_sms_code(request.phone)
        return models.MessageResponse(message=message)
    except APIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()

@router.post("/login", response_model=models.TokenResponse)
async def login(request: models.LoginRequest):
    """
    使用手机号和验证码登录
    """
    client = SevenPaceAsyncClient()
    try:
        await client.login(request.phone, request.code)
        token = client.headers.get("authorization", "").replace("Bearer ", "")
        return models.TokenResponse(token=token, expired_at=client.expired_at)
    except APIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()

@router.post("/token_login", response_model=models.MessageResponse)
async def token_login(request: models.TokenRequest):
    """
    使用已有的 Token 登录 (实际是验证 Token 有效性)
    """
    client = SevenPaceAsyncClient()
    try:
        client.set_token(request.token)
        # A simple check to see if the token is valid by fetching user info
        await client.get_user_info()
        return models.MessageResponse(message="Token is valid")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    finally:
        await client.close()
