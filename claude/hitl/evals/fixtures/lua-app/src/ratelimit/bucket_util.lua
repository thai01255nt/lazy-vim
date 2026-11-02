-- Token-bucket helpers shared by the take / peek modules.
local M = {}

---@class Bucket
---@field tokens number # tokens currently in the bucket
---@field capacity number # most tokens the bucket can hold
---@field ratePerSec number # tokens added per second
---@field updatedAtMs integer # time of the last refill

-- Adds the tokens earned since the last refill, never above capacity.
-- A clock that goes backwards adds nothing. Returns the tokens added.
---@class RefillOptions
---@field bucket Bucket
---@field nowMs integer # current time in milliseconds
---@param options RefillOptions
---@return number
local function refillBucket(options)
	local bucket = options.bucket
	local elapsedMs = math.max(0, options.nowMs - bucket.updatedAtMs)
	local earned = elapsedMs * bucket.ratePerSec / 1000
	local added = math.min(earned, bucket.capacity - bucket.tokens)
	bucket.tokens = bucket.tokens + added
	bucket.updatedAtMs = options.nowMs
	return added
end

M.refillBucket = refillBucket

return M
