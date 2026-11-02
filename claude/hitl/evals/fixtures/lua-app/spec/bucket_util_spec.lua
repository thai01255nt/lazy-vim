local bucket_util = require("ratelimit.bucket_util")

describe("src/ratelimit/bucket_util.lua#refillBucket", function()
	it("stops at capacity", function()
		local b = { tokens = 9, capacity = 10, ratePerSec = 1, updatedAtMs = 0 }
		bucket_util.refillBucket({ bucket = b, nowMs = 5000 })
		assert.are.equal(10, b.tokens)
	end)
end)
