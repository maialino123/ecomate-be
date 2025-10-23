# Cost Calculation Module

Module tính toán chi phí và giá bán sản phẩm theo công thức chuẩn cho dropshipping từ Trung Quốc.

## Công thức tính giá

### Công thức tổng thể

```
P = ([(P_nhập + P_shipTQ) × T_CNY→VND + P_shipVN + P_xử_lý] / SL(1-R)) × (1+G) / (1-F)
```

### Các biến số

| Ký hiệu | Tên biến | Mô tả | Đơn vị |
|---------|----------|-------|--------|
| `P_nhập` | importPrice | Giá nhập từ 1688/xưởng | CNY (¥) |
| `P_shipTQ` | domesticShippingCN | Phí ship nội địa TQ | CNY (¥) |
| `T_CNY→VND` | exchangeRateCNY | Tỷ giá CNY sang VND | VND/¥ |
| `P_shipVN` | internationalShippingVN | Phí ship quốc tế (TQ → VN) | VND |
| `P_xử_lý` | handlingFee | Chi phí xử lý/gom hàng/thuế | VND |
| `SL` | quantity | Số lượng sản phẩm trong lô | cái |
| `R` | returnRate | Tỷ lệ hoàn hàng | 0.05 = 5% |
| `F` | platformFeeRate | Phí sàn TMĐT | 0.20 = 20% |
| `G` | profitMarginRate | Biên lợi nhuận mong muốn | 0.15 = 15% |
| `P` | suggestedSellingPrice | Giá bán đề xuất | VND |

### Các bước tính toán

#### 1. Giá vốn cơ bản (C₀)
```
C₀ = [(P_nhập + P_shipTQ) × T_CNY→VND + P_shipVN + P_xử_lý] / SL
```
Giá vốn thực tế 1 sản phẩm sau khi nhập về VN.

#### 2. Giá vốn hiệu dụng (C_eff)
```
C_eff = C₀ / (1 - R)
```
Chi phí thực tế khi tính đến tỷ lệ hoàn hàng. Nếu 10% đơn bị hoàn, chi phí dồn vào 90% đơn còn lại.

#### 3. Giá bán đề xuất (P)
```
P = C_eff × (1 + G) / (1 - F)
```
Giá bán cần đạt để có lợi nhuận mục tiêu sau khi trừ phí sàn.

#### 4. Lợi nhuận ròng (L)
```
L = P × (1 - F) - C_eff
```
Lợi nhuận thực tế trên mỗi sản phẩm bán được.

#### 5. Giá hòa vốn (P_BE)
```
P_BE = C_eff / (1 - F)
```
Giá tối thiểu để không lỗ (khi G = 0).

## API Endpoints

### 1. Tính giá nhanh (không lưu DB)
```http
POST /cost/calculate
```

Dùng để tính toán nhanh mà không lưu vào database. Phù hợp khi muốn thử nhiều kịch bản.

**Request Body:**
```json
{
  "importPrice": 5.2,
  "domesticShippingCN": 10,
  "internationalShippingVN": 75000,
  "handlingFee": 50000,
  "exchangeRateCNY": 3600,
  "quantity": 50,
  "returnRate": 0.05,
  "platformFeeRate": 0.20,
  "profitMarginRate": 0.15
}
```

**Response:**
```json
{
  "baseCost": 22500,
  "effectiveCost": 23684.21,
  "suggestedSellingPrice": 34013.16,
  "netProfit": 3526.32,
  "breakEvenPrice": 29605.26,
  "calculationBreakdown": {
    "inputs": { ... },
    "steps": { ... },
    "percentages": { ... }
  }
}
```

### 2. Tạo và lưu cost calculation
```http
POST /cost/calculations
```

Tạo và lưu tính toán chi phí vào database.

**Request Body:** Giống như `/calculate` nhưng có thêm:
```json
{
  "productId": "cm123abc456",
  "currency": "VND",
  "notes": "Cost calculation for Q4 2024",
  ... // các trường giống /calculate
}
```

### 3. Lấy cost calculation theo ID
```http
GET /cost/calculations/:id
```

### 4. Lấy tất cả cost calculations của sản phẩm
```http
GET /cost/calculations/product/:productId?page=1&limit=10
```

### 5. Lấy cost calculation mới nhất của sản phẩm
```http
GET /cost/calculations/product/:productId/latest
```

### 6. Cập nhật cost calculation
```http
PATCH /cost/calculations/:id
```

Cập nhật một phần hoặc toàn bộ. Hệ thống sẽ tự động tính lại.

### 7. Xóa cost calculation
```http
DELETE /cost/calculations/:id
```

## Ví dụ sử dụng

### Ví dụ 1: Tính giá cho lô hàng 1688

```typescript
// Input
const input = {
  importPrice: 21000 / 3600, // 21,000 VND = 5.83 CNY
  domesticShippingCN: 0,
  internationalShippingVN: 75000, // 3 USD
  handlingFee: 0,
  exchangeRateCNY: 3600,
  quantity: 50,
  returnRate: 0.10, // 10% hoàn hàng
  platformFeeRate: 0.20, // 20% phí sàn
  profitMarginRate: 0.15 // 15% lợi nhuận
};

// Expected output
// C₀ = (21,000 * 50 + 75,000) / 50 = 22,500 VND
// C_eff = 22,500 / 0.9 = 25,000 VND
// P = 25,000 * 1.15 / 0.8 = 35,937.5 ≈ 36,000 VND
// L = 36,000 * 0.8 - 25,000 = 3,800 VND
```

### Ví dụ 2: Tính giá cho nhiều sản phẩm với phí ship nội địa

```typescript
const input = {
  importPrice: 5.2, // CNY
  domesticShippingCN: 10, // CNY
  internationalShippingVN: 75000, // VND
  handlingFee: 50000, // VND (gồm thuế + xử lý)
  exchangeRateCNY: 3600,
  quantity: 50,
  returnRate: 0.05, // 5%
  platformFeeRate: 0.20, // 20%
  profitMarginRate: 0.15 // 15%
};

// Calculation:
// Total CNY = 5.2 + 10 = 15.2 CNY
// Total CNY in VND = 15.2 * 3600 = 54,720 VND
// Total VND = 54,720 + 75,000 + 50,000 = 179,720 VND
// C₀ = 179,720 / 50 = 3,594.4 VND/sp
// C_eff = 3,594.4 / 0.95 = 3,783.58 VND
// P = 3,783.58 * 1.15 / 0.8 = 5,433.17 VND
// L = 5,433.17 * 0.8 - 3,783.58 = 562.96 VND/sp
```

## Database Schema

```prisma
model CostCalculation {
  id                      String   @id @default(cuid())
  productId               String
  userId                  String

  // Input costs
  importPrice             Decimal  // CNY
  domesticShippingCN      Decimal  // CNY
  internationalShippingVN Decimal  // VND
  handlingFee             Decimal  // VND

  // Exchange rate and quantity
  exchangeRateCNY         Decimal
  quantity                Int

  // Business parameters
  returnRate              Decimal  // 0.05 = 5%
  platformFeeRate         Decimal  // 0.20 = 20%
  profitMarginRate        Decimal  // 0.15 = 15%

  // Calculated results
  baseCost                Decimal  // C₀
  effectiveCost           Decimal  // C_eff
  suggestedSellingPrice   Decimal  // P
  netProfit               Decimal  // L
  breakEvenPrice          Decimal  // P_BE

  // Metadata
  currency                String   @default("VND")
  notes                   String?
  calculationData         Json?

  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}
```

## Lưu ý khi sử dụng

### 1. Tỷ giá
- Cập nhật tỷ giá định kỳ để đảm bảo tính chính xác
- Có thể lưu trong SystemSettings hoặc tích hợp API tỷ giá

### 2. Tỷ lệ hoàn hàng
- Dựa trên dữ liệu lịch sử của shop
- Nên tính riêng cho từng loại sản phẩm
- Default: 5-10% cho sản phẩm thông thường

### 3. Phí sàn
- Shopee: ~20-25%
- Lazada: ~18-23%
- TikTok Shop: ~15-20%
- Cần cộng thêm phí thanh toán (1-2%) nếu có

### 4. Biên lợi nhuận
- Sản phẩm giá rẻ: 15-20%
- Sản phẩm trung bình: 20-30%
- Sản phẩm cao cấp: 30-50%

### 5. Chi phí xử lý (handlingFee)
Bao gồm:
- Thuế nhập khẩu (nếu có)
- Phí kho trung gian
- Phí đóng gói
- Phí quản lý
- Buffer cho rủi ro

## Testing

Xem file `test-cost-calculation.http` để test API với REST Client extension.

## Tích hợp với Product Module

Cost calculation có thể được sử dụng để:
1. Tự động cập nhật giá bán đề xuất vào Product
2. So sánh giá nhập từ nhiều nhà cung cấp
3. Phân tích biến động giá theo thời gian
4. Tính toán lợi nhuận thực tế

## Roadmap

- [ ] Auto-update tỷ giá từ API
- [ ] Bulk calculation cho nhiều sản phẩm
- [ ] Export báo cáo chi phí
- [ ] Dashboard phân tích lợi nhuận
- [ ] Template cho các loại sản phẩm khác nhau
- [ ] Integration với 1688 để tự động lấy giá
