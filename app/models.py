from pydantic import BaseModel, Field

class PhoneRequest(BaseModel):
    phone: str = Field(..., description="用户手机号")

class LoginRequest(BaseModel):
    phone: str = Field(..., description="用户手机号")
    code: str = Field(..., description="短信验证码")

class TokenRequest(BaseModel):
    token: str = Field(..., description="用户 Token")

class MessageResponse(BaseModel):
    message: str

class TokenResponse(BaseModel):
    token: str
    expired_at: str

class OrderRequest(BaseModel):
    car_number: str = Field(..., description="车辆编号")

class PayRequest(BaseModel):
    order_id: int = Field(..., description="订单ID")
    created_at: str = Field(..., description="订单创建时间")

from typing import Optional

class PeriodicTaskCreate(BaseModel):
    name: str = Field(..., description="任务名称")
    cron: str = Field(..., description="CRON表达式, e.g., '0 8 * * 1-5'")
    latitude: float = Field(..., description="目标区域纬度")
    longitude: float = Field(..., description="目标区域经度")
    location_name: Optional[str] = Field(None, description="地点名称")
    min_electricity: int = Field(..., description="车辆最低电量要求")
    max_loops: int = Field(10, description="单次预约任务的最大循环次数")
    carmodel_id: Optional[int] = Field(None, description="车辆型号ID (1: 单车, 2: 电单车)")
