require_relative "../lib/user_service"

RSpec.describe Acme::UserService do
  describe "#create_user" do
    # @covers UserService.create_user @ac QT-T5.AC1 @kind example @origin skeleton
    it "QT-T5.AC1 rejects duplicate email"

    it "counts" do
      expect(described_class.new(nil).count).to eq(0)
    end
  end
end
