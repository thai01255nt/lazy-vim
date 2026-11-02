-- Admission check: takes tokens from a client's bucket.
local bucket_util = require("ratelimit.bucket_util")

local M = {}

-- Takes `count` tokens when the bucket holds enough; takes nothing otherwise.
---@param bucket Bucket
---@param count number
---@param nowMs integer
---@return boolean taken
function M.take(bucket, count, nowMs)
	bucket_util.refillBucket({ bucket = bucket, nowMs = nowMs })
	if bucket.tokens < count then
		return false
	end
	bucket.tokens = bucket.tokens - count
	return true
end

return M
