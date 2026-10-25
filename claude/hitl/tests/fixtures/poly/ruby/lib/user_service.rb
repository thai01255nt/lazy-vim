# frozen_string_literal: true

require "set"

module Acme
  # Registers users.
  class UserService
    def initialize(repo)
      @repo = repo
    end

    # Registers a user; rejects duplicate emails.
    # @task T-5 @impl agent @status skeleton @prio 1
    # @calls UserRepo.find_by_email
    # @concurrency none
    def create_user(email)
      # TODO(impl): 1. reject duplicates
      raise NotImplementedError, "TODO(impl): UserService#create_user"
    end

    def count
      return 0 if @repo.nil?
      @repo.items.each do |x|
        puts "#{x} end"
      end
      @repo.size()
    end

    def ready? = true

    private

    def secret
      <<~SQL
        select 1 end
      SQL
    end
  end

  class UserRepo
    # Finds a user by email.
    # @task T-5 @impl manual @status skeleton @prio 2
    def find_by_email(email)
      raise NotImplementedError, "TODO(impl): UserRepo#find_by_email"
    end
  end
end
