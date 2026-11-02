local take = require("ratelimit.take")

describe("src/ratelimit/take.lua#M.take", function()
	it("takes tokens when the bucket holds enough", function()
		local b = { tokens = 5, capacity = 10, ratePerSec = 1, updatedAtMs = 0 }
		assert.is_true(take.take(b, 3, 0))
		assert.are.equal(2, b.tokens)
	end)
	it("takes nothing when the bucket is short", function()
		local b = { tokens = 1, capacity = 10, ratePerSec = 1, updatedAtMs = 0 }
		assert.is_false(take.take(b, 3, 0))
		assert.are.equal(1, b.tokens)
	end)
end)
