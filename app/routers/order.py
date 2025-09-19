from fastapi import APIRouter, Depends, HTTPException
from ..sdk.seven_ma_sdk import SevenPaceAsyncClient, APIError
from ..dependencies import get_authenticated_client
from .. import models

router = APIRouter()

@router.post("", response_model=models.MessageResponse)
async def create_order(
    request: models.OrderRequest,
    client: SevenPaceAsyncClient = Depends(get_authenticated_client)
):
    """
    创建订单 (预约车辆)
    """
    try:
        message = await client.order_car(request.car_number)
        return models.MessageResponse(message=message)
    except APIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()

@router.get("/current", response_model=dict)
async def get_current_order(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    获取当前骑行订单
    """
    try:
        order = await client.current_cycling_order()
        return dict(order)
    except APIError as e:
        # It's common to have no current order, so we return 404
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        await client.close()

@router.post("/actions/unlock", response_model=models.MessageResponse)
async def unlock_car(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    解锁车辆
    """
    try:
        await client.unlock_car()
        return models.MessageResponse(message="Unlock command sent")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send unlock command: {e}")
    finally:
        await client.close()

@router.post("/actions/lock", response_model=models.MessageResponse)
async def temporary_lock_car(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    临时锁车
    """
    try:
        await client.temporary_lock_car()
        return models.MessageResponse(message="Temporary lock command sent")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send lock command: {e}")
    finally:
        await client.close()

@router.post("/actions/return", response_model=models.MessageResponse)
async def return_car(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    还车
    """
    try:
        cmd = await client.back_car()
        return models.MessageResponse(message=f"Return car command sent: {cmd}")
    except APIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()

@router.post("/pay", response_model=models.MessageResponse)
async def pay_order(
    request: models.PayRequest,
    client: SevenPaceAsyncClient = Depends(get_authenticated_client)
):
    """
    支付订单
    """
    try:
        message = await client.pay_with_balance(request.order_id, request.created_at)
        return models.MessageResponse(message=message)
    except APIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()

@router.post("/signin", response_model=models.MessageResponse)
async def signin(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    签到
    """
    try:
        message = await client.signin()
        return models.MessageResponse(message=message)
    except APIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()

@router.get("/unpaid", response_model=dict)
async def get_unpaid_order(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    获取未支付的订单
    """
    try:
        order_info = await client.get_unpaid_order()
        if order_info:
            return order_info
        raise HTTPException(status_code=404, detail="No unpaid order found")
    except APIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()

@router.post("/pay_unpaid", response_model=models.MessageResponse)
async def pay_unpaid_order(client: SevenPaceAsyncClient = Depends(get_authenticated_client)):
    """
    支付未支付的订单
    """
    try:
        order_info = await client.get_unpaid_order()
        if not order_info:
            raise HTTPException(status_code=404, detail="No unpaid order to pay")
        
        message = await client.pay_with_balance(order_info["order_id"], order_info["created_at"])
        return models.MessageResponse(message=message)
    except APIError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        await client.close()
