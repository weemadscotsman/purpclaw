# Blockchain Balance Check APIs

## Bitcoin (Blockstream)
```bash
curl -s "https://blockstream.info/api/address/{addr}" | \
  python -c "import sys,json; d=json.load(sys.stdin); print(d.get('chain_stats',{}).get('funded_txo_sum',0)/100000000, 'BTC')"
# funded_txo_sum in satoshis. 1 BTC = 100,000,000 sats.
```

## Ethereum (Blockscout)
```bash
curl -s "https://eth.blockscout.com/api/v2/addresses/{addr}" | \
  python -c "import sys,json; d=json.load(sys.stdin); print('ETH balance:', d.get('coin_balance', '0'))"
```

## Validate Before Reporting
OCR garbles addresses. Always validate:
- `curl -s "https://blockstream.info/api/address/{suspect}"` → "base58 error" = invalid/reject
- Valid = JSON with balance data

## Address Formats
| Type | Prefix | Example |
|------|--------|---------|
| BTC P2PKH | 1... | 1AogR4NhBiR74qzRmtXMpQRRXdzowjKJB |
| BTC P2SH | 3... | 33kSUU3HgVbof9hcPxTZ2VgrzqVJytM7ew |
| BTC Bech32 | bc1... | bc1qzeuk4uvdpdjnjaedms0c02tv3yedngtvv08n6p |
| ETH | 0x + 40 hex | 0x6A7cfe9eA512c90eF834FC4173d01ccdeE1619D5 |