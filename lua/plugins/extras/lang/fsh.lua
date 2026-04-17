-- FHIR Shorthand (FSH) language support.
-- Combines:
--   * vim-integration (https://gitlab.com/australian-e-health-research-centre/fsh-lsp/vim-integration)
--     → LSP server wiring via @aehrc/fsh-lsp
--   * vscode-fsh (https://github.com/standardhealth/vscode-language-fsh)
--     → grammar, snippets, Open FHIR Documentation, FSH ⇄ FHIR conversion, SUSHI build
--
-- Supporting files:
--   ~/.config/nvim/ftdetect/fsh.vim        → filetype detection for *.fsh
--   ~/.config/nvim/syntax/fsh.vim          → ported tmLanguage grammar
--   ~/.config/nvim/after/ftplugin/fsh.lua  → per-buffer options (commentstring, indent, …)
--   ~/.config/nvim/snippets/fsh.json       → VSCode-format snippets (loaded by nvim-snippets)
--
-- Requires `fsh-lsp` on PATH:  npm install -g @aehrc/fsh-lsp
-- Optional tools invoked by user commands:
--   npm install -g fsh-sushi   -- for :FshToFhir / :FshBuild
--   npm install -g gofsh       -- for :FhirToFsh

-- -----------------------------------------------------------------------------
-- LSP wiring
-- -----------------------------------------------------------------------------

-- Markers that identify a FHIR IG root, in priority order.
local ROOT_MARKERS = {
  { "sushi-config.yaml", "sushi-config.yml", "ig.ini" },
  { "package.json", ".git" },
}

-- fsh-lsp 0.8.x prints via console.log in production paths, which corrupts
-- the stdio JSON-RPC channel ("INVALID_SERVER_JSON"). Route it through a
-- Node wrapper that silences stdout noise and forwards it to stderr.
local function resolve_fsh_cmd()
  local wrapper = vim.fn.stdpath("config") .. "/bin/fsh-lsp-wrapper.js"
  if vim.uv.fs_stat(wrapper) and vim.fn.executable("node") == 1 then
    return { "node", wrapper }
  end
  return { "fsh-lsp", "--stdio" }
end

-- Full set of options exposed by @aehrc/fsh-lsp 0.8.x.
local FSH_SETTINGS = {
  fsh = {
    enable = true,
    fhirVersion = "4.0.1",
    validation = { enabled = true },
    hover = {
      showElementInfo = true,
      showDocumentationLinks = true,
    },
    completion = { enabled = true },
    terminology = {
      servers = { "https://tx.fhir.org/r4" },
      enableCache = true,
    },
    id = {
      useKebabCase = false,
      addTypeSuffix = false,
    },
    format = {
      indentSize = 2,
      maxLineLength = 120,
      alignCaretPaths = true,
    },
    diagnostics = {
      maxProblems = 100,
    },
  },
}

-- No client-side preload.
--
-- Earlier versions loaded every *.fsh file via `vim.fn.bufload` to make `gd`
-- feel instant. That fires `textDocument/didOpen` for each file, which the
-- single-threaded server processes serially through its diagnostic provider
-- (each didOpen computes full diagnostics). For a 492-file IG that's 20+
-- seconds of server work, during which subsequent `gd` requests queue
-- behind it. Net result: the "optimization" made things slower.
--
-- The upstream server's own FshWorkspaceIndex.scanWorkspace() walks
-- `<root>/input/fsh/` on initialize, so cross-file navigation already works
-- without any client-side warming. For non-standard layouts, gd still works
-- because FshDefinitionProvider.updateFunctions() walks the whole project
-- root (patched by our wrapper to be cached).

-- -----------------------------------------------------------------------------
-- Diagnostic filter
-- -----------------------------------------------------------------------------
-- Work around fsh-lsp's incomplete hardcoded `isBuiltInType` list:
-- it flags legitimate FHIR R4 resources (Claim, Account, Coverage, …) as
-- "Unknown parent profile". We drop those diagnostics here.
local FHIR_R4_RESOURCES = {
  -- Base/infrastructure
  Base = true, Element = true, BackboneElement = true, DataType = true,
  Resource = true, DomainResource = true, CanonicalResource = true, MetadataResource = true,
  -- All FHIR R4 resources
  Account = true, ActivityDefinition = true, AdverseEvent = true, AllergyIntolerance = true,
  Appointment = true, AppointmentResponse = true, AuditEvent = true, Basic = true,
  Binary = true, BiologicallyDerivedProduct = true, BodyStructure = true, Bundle = true,
  CapabilityStatement = true, CarePlan = true, CareTeam = true, CatalogEntry = true,
  ChargeItem = true, ChargeItemDefinition = true, Claim = true, ClaimResponse = true,
  ClinicalImpression = true, CodeSystem = true, Communication = true, CommunicationRequest = true,
  CompartmentDefinition = true, Composition = true, ConceptMap = true, Condition = true,
  Consent = true, Contract = true, Coverage = true, CoverageEligibilityRequest = true,
  CoverageEligibilityResponse = true, DetectedIssue = true, Device = true, DeviceDefinition = true,
  DeviceMetric = true, DeviceRequest = true, DeviceUseStatement = true, DiagnosticReport = true,
  DocumentManifest = true, DocumentReference = true, Encounter = true, Endpoint = true,
  EnrollmentRequest = true, EnrollmentResponse = true, EpisodeOfCare = true, EventDefinition = true,
  Evidence = true, EvidenceVariable = true, ExampleScenario = true, ExplanationOfBenefit = true,
  FamilyMemberHistory = true, Flag = true, Goal = true, GraphDefinition = true,
  Group = true, GuidanceResponse = true, HealthcareService = true, ImagingStudy = true,
  Immunization = true, ImmunizationEvaluation = true, ImmunizationRecommendation = true,
  ImplementationGuide = true, InsurancePlan = true, Invoice = true, Library = true,
  Linkage = true, List = true, Location = true, Measure = true, MeasureReport = true,
  Media = true, Medication = true, MedicationAdministration = true, MedicationDispense = true,
  MedicationKnowledge = true, MedicationRequest = true, MedicationStatement = true,
  MedicinalProduct = true, MedicinalProductAuthorization = true, MedicinalProductContraindication = true,
  MedicinalProductIndication = true, MedicinalProductIngredient = true, MedicinalProductInteraction = true,
  MedicinalProductManufactured = true, MedicinalProductPackaged = true, MedicinalProductPharmaceutical = true,
  MedicinalProductUndesirableEffect = true, MessageDefinition = true, MessageHeader = true,
  MolecularSequence = true, NamingSystem = true, NutritionOrder = true, Observation = true,
  ObservationDefinition = true, OperationDefinition = true, OperationOutcome = true,
  Organization = true, OrganizationAffiliation = true, Parameters = true, Patient = true,
  PaymentNotice = true, PaymentReconciliation = true, Person = true, PlanDefinition = true,
  Practitioner = true, PractitionerRole = true, Procedure = true, Provenance = true,
  Questionnaire = true, QuestionnaireResponse = true, RelatedPerson = true, RequestGroup = true,
  ResearchDefinition = true, ResearchElementDefinition = true, ResearchStudy = true,
  ResearchSubject = true, RiskAssessment = true, RiskEvidenceSynthesis = true, Schedule = true,
  SearchParameter = true, ServiceRequest = true, Slot = true, Specimen = true,
  SpecimenDefinition = true, StructureDefinition = true, StructureMap = true, Subscription = true,
  Substance = true, SubstanceNucleicAcid = true, SubstancePolymer = true, SubstanceProtein = true,
  SubstanceReferenceInformation = true, SubstanceSourceMaterial = true, SubstanceSpecification = true,
  SupplyDelivery = true, SupplyRequest = true, Task = true, TerminologyCapabilities = true,
  TestReport = true, TestScript = true, ValueSet = true, VerificationResult = true,
  VisionPrescription = true,
  -- Common datatypes
  Address = true, Age = true, Annotation = true, Attachment = true, CodeableConcept = true,
  CodeableReference = true, Coding = true, ContactDetail = true, ContactPoint = true,
  Contributor = true, Count = true, DataRequirement = true, Distance = true, Dosage = true,
  Duration = true, Expression = true, Extension = true, HumanName = true, Identifier = true,
  Meta = true, Money = true, MoneyQuantity = true, Narrative = true, ParameterDefinition = true,
  Period = true, Quantity = true, Range = true, Ratio = true, Reference = true,
  RelatedArtifact = true, SampledData = true, Signature = true, SimpleQuantity = true,
  Timing = true, TriggerDefinition = true, UsageContext = true,
  -- Primitives
  base64Binary = true, boolean = true, canonical = true, code = true, date = true,
  dateTime = true, decimal = true, id = true, instant = true, integer = true,
  markdown = true, oid = true, positiveInt = true, string = true, time = true,
  unsignedInt = true, uri = true, url = true, uuid = true, xhtml = true,
}

local function is_known_fhir_type(name)
  if not name or name == "" then
    return false
  end
  if FHIR_R4_RESOURCES[name] then
    return true
  end
  -- Canonical URLs are fine
  if name:match("^https?://") then
    return true
  end
  return false
end

-- Message is "Unknown parent profile: Claim" or "Unknown parent profile: Claim (in Profile: Foo)".
-- Capture up to first space or end, then strip trailing punctuation.
local UNKNOWN_PARENT_PATTERN = "^Unknown parent %w+:%s+([%w%-_]+)"

-- -----------------------------------------------------------------------------
-- Snippet body normalizer
-- -----------------------------------------------------------------------------
--
-- friendly-snippets ships an fsh.json with nested regex transforms
-- (`${3:${1/(...)/${2:/downcase}.../g}}`) that Neovim's built-in vim.snippet
-- parser rejects. vim-vsnip / cmp-vsnip scan the runtime path independently
-- of our nvim-snippets registry override, so those bodies still reach
-- vim.snippet.expand. We strip the transforms with a brace-balanced walk
-- before delegating to the original expand.

local function strip_snippet_transforms(body)
  if type(body) ~= "string" or not body:find("%${%d+/", 1) then
    return body
  end
  local out = {}
  local i = 1
  while i <= #body do
    local start, finish, num = body:find("^%${(%d+)/", i)
    if not start then
      out[#out + 1] = body:sub(i, i)
      i = i + 1
    else
      -- Skip past `${N/` and walk until we find the matching closing `}`
      -- at the outermost level. `{` opens nesting, `}` closes it. We start
      -- at depth 1 because we've already consumed the outer `${`.
      local depth, j = 1, finish + 1
      while j <= #body and depth > 0 do
        local c = body:sub(j, j)
        if c == "{" then
          depth = depth + 1
        elseif c == "}" then
          depth = depth - 1
          if depth == 0 then
            break
          end
        end
        j = j + 1
      end
      if depth == 0 then
        out[#out + 1] = "${" .. num .. "}"
        i = j + 1
      else
        -- Unbalanced — emit the raw text and bail out.
        out[#out + 1] = body:sub(start)
        i = #body + 1
      end
    end
  end
  return table.concat(out)
end

local function install_snippet_shim()
  if vim.g._fsh_snippet_shim_installed then
    return
  end
  vim.g._fsh_snippet_shim_installed = true
  if not (vim.snippet and vim.snippet.expand) then
    return
  end
  local orig = vim.snippet.expand
  vim.snippet.expand = function(body)
    local ok, err = pcall(orig, body)
    if ok then
      return
    end
    local fixed = strip_snippet_transforms(body)
    if fixed ~= body then
      local ok2 = pcall(orig, fixed)
      if ok2 then
        return
      end
    end
    -- Re-raise original error if we couldn't fix it.
    error(err, 0)
  end
end

local function install_diagnostic_filter()
  if vim.g._fsh_diag_filter_installed then
    return
  end
  vim.g._fsh_diag_filter_installed = true

  local orig = vim.lsp.handlers["textDocument/publishDiagnostics"]
  vim.lsp.handlers["textDocument/publishDiagnostics"] = function(err, result, ctx, config)
    if result and result.diagnostics then
      local kept = {}
      for _, d in ipairs(result.diagnostics) do
        local drop = false
        if d.source == "fsh-lsp" then
          local parent = d.message and d.message:match(UNKNOWN_PARENT_PATTERN)
          if parent and is_known_fhir_type(parent) then
            drop = true
          end
        end
        if not drop then
          kept[#kept + 1] = d
        end
      end
      result.diagnostics = kept
    end
    return orig(err, result, ctx, config)
  end
end

-- -----------------------------------------------------------------------------
-- vscode-fsh `openFhir` port.
-- -----------------------------------------------------------------------------

local DOC_VERSION_PATHS = {
  ["4.0.1"] = "/R4",
  ["4.1.0"] = "/2021Mar",
  ["4.3.0-snapshot1"] = "/4.3.0-snapshot1",
  ["4.3.0"] = "/R4B",
  ["4.2.0"] = "/2020Feb",
  ["4.4.0"] = "/2020May",
  ["4.5.0"] = "/2020Sep",
  ["4.6.0"] = "/2021May",
  ["5.0.0-snapshot1"] = "/5.0.0-snapshot1",
  ["5.0.0-ballot"] = "/2022Sep",
  ["5.0.0-snapshot3"] = "/5.0.0-snapshot3",
  ["5.0.0-draft-final"] = "/5.0.0-draft-final",
  ["5.0.0"] = "/R5",
}

local SPECIAL_URLS = {
  alias = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-aliases",
  profile = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-profiles",
  ["extension:"] = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-extensions",
  invariant = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-invariants",
  instance = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-instances",
  valueset = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-value-sets",
  codesystem = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-code-systems",
  ruleset = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-rule-sets",
  mapping = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-mappings",
  logical = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-logical-models",
  resource = "https://hl7.org/fhir/uv/shorthand/reference.html#defining-resources",
  from = "https://hl7.org/fhir/uv/shorthand/reference.html#binding-rules",
  obeys = "https://hl7.org/fhir/uv/shorthand/reference.html#obeys-rules",
  only = "https://hl7.org/fhir/uv/shorthand/reference.html#type-rules",
  contains = "https://hl7.org/fhir/uv/shorthand/reference.html#contains-rules-for-extensions",
}

local function open_url(url)
  local opener
  if vim.fn.has("mac") == 1 then
    opener = { "open", url }
  elseif vim.fn.has("wsl") == 1 then
    opener = { "wslview", url }
  elseif vim.fn.executable("xdg-open") == 1 then
    opener = { "xdg-open", url }
  else
    opener = { "cmd.exe", "/c", "start", url }
  end
  vim.system(opener, { detach = true })
  vim.notify("Opened " .. url, vim.log.levels.INFO)
end

local function get_fhir_doc_name()
  -- Match the Extension-as-keyword special case first.
  local line = vim.api.nvim_get_current_line()
  local col = vim.api.nvim_win_get_cursor(0)[2] + 1

  local ext_start, ext_end = line:find("Extension%s*:")
  if ext_start and col >= ext_start and col <= ext_end then
    return "extension:"
  end

  -- Fall back to the word under cursor with iskeyword including '-' (see ftplugin).
  local word = vim.fn.expand("<cword>")
  return word
end

local function fhir_version(fsh_client)
  if fsh_client and fsh_client.settings and fsh_client.settings.fsh then
    return fsh_client.settings.fsh.fhirVersion or "4.0.1"
  end
  return "4.0.1"
end

local function doc_uri_for(name, version)
  local version_path = DOC_VERSION_PATHS[version] or ""
  local lower = name:lower()
  if lower == "extension" then
    return ("https://hl7.org/fhir%s/extensibility.html"):format(version_path)
  end
  if SPECIAL_URLS[lower] then
    return SPECIAL_URLS[lower]
  end
  return ("https://hl7.org/fhir%s/%s.html"):format(version_path, lower)
end

local function open_fhir_docs()
  local name = get_fhir_doc_name()
  if not name or name == "" then
    vim.notify("No word under cursor", vim.log.levels.WARN)
    return
  end
  local clients = vim.lsp.get_clients({ bufnr = 0, name = "fsh" })
  open_url(doc_uri_for(name, fhir_version(clients[1])))
end

-- -----------------------------------------------------------------------------
-- SUSHI + gofsh commands
-- -----------------------------------------------------------------------------

local function require_executable(bin, install_hint)
  if vim.fn.executable(bin) == 1 then
    return true
  end
  vim.notify(("%s not found on PATH. Install with: %s"):format(bin, install_hint), vim.log.levels.ERROR)
  return false
end

local function project_root()
  local clients = vim.lsp.get_clients({ bufnr = 0, name = "fsh" })
  if clients[1] and clients[1].config.root_dir then
    return clients[1].config.root_dir
  end
  local cur = vim.fs.find({ "sushi-config.yaml", "sushi-config.yml", "ig.ini" }, {
    upward = true,
    path = vim.fs.dirname(vim.api.nvim_buf_get_name(0)),
  })[1]
  return cur and vim.fs.dirname(cur) or vim.fn.getcwd()
end

local function run_in_terminal(cmd, cwd)
  vim.cmd("botright split")
  vim.cmd("resize 15")
  vim.fn.termopen(cmd, { cwd = cwd })
  vim.cmd("startinsert")
end

local function fsh_build()
  if not require_executable("sushi", "npm install -g fsh-sushi") then
    return
  end
  local root = project_root()
  run_in_terminal({ "sushi", "." }, root)
end

local function fsh_to_fhir()
  if not require_executable("sushi", "npm install -g fsh-sushi") then
    return
  end
  local root = project_root()
  run_in_terminal({ "sushi", "." }, root)
end

local function fhir_to_fsh(path)
  if not require_executable("gofsh", "npm install -g gofsh") then
    return
  end
  path = path and vim.fs.normalize(path) or vim.api.nvim_buf_get_name(0)
  if path == "" then
    vim.notify("Pass a .json/.xml FHIR resource path", vim.log.levels.ERROR)
    return
  end
  local root = project_root()
  run_in_terminal({ "gofsh", path, "-o", root .. "/fsh-generated" }, root)
end

-- -----------------------------------------------------------------------------
-- Lazy.nvim spec
-- -----------------------------------------------------------------------------

return {
  {
    "neovim/nvim-lspconfig",
    opts = function(_, opts)
      opts.servers = opts.servers or {}
      opts.servers.fsh = {
        mason = false,
        cmd = resolve_fsh_cmd(),
        filetypes = { "fsh" },
        root_markers = ROOT_MARKERS,
        settings = FSH_SETTINGS,
        init_options = FSH_SETTINGS,
        on_attach = function(client, bufnr)
          install_diagnostic_filter()
          install_snippet_shim()
          local ok, mod = pcall(require, "plugins.extras.lang.on_attach")
          if ok and mod and mod.on_attach then
            mod.on_attach(client, bufnr)
          end
        end,
      }
    end,
  },

  -- Teach nvim-snippets where to find our VSCode-format FSH snippets.
  -- LazyVim enables `friendly_snippets = true`, which ships an fsh.json that
  -- relies on nested regex transforms (`${3:${1/.../.../g}}`) the built-in
  -- vim.snippet parser rejects. Override the registry entry so only ours
  -- is used for the `fsh` filetype.
  {
    "garymjr/nvim-snippets",
    optional = true,
    opts = function(_, opts)
      opts = opts or {}
      opts.search_paths = opts.search_paths or {}
      local local_path = vim.fn.stdpath("config") .. "/snippets"
      if not vim.tbl_contains(opts.search_paths, local_path) then
        table.insert(opts.search_paths, local_path)
      end
      return opts
    end,
    config = function(_, opts)
      require("snippets").setup(opts)
      local registry = require("snippets").registry
      local my_path = vim.fn.stdpath("config") .. "/snippets/fsh.json"
      if vim.uv.fs_stat(my_path) then
        registry.fsh = { my_path }
      end
    end,
  },

  -- User commands + keymaps for FSH-specific actions.
  {
    "nvim-lua/plenary.nvim",
    lazy = false,
    priority = 500,
    config = function()
      install_snippet_shim()

      vim.api.nvim_create_user_command("FshOpenDoc", open_fhir_docs, {
        desc = "Open HL7 FHIR documentation for the word under the cursor",
      })

      vim.api.nvim_create_user_command("FshBuild", fsh_build, {
        desc = "Run `sushi .` in the FSH project root",
      })

      vim.api.nvim_create_user_command("FshToFhir", fsh_to_fhir, {
        desc = "Convert FSH sources to FHIR JSON via SUSHI",
      })

      vim.api.nvim_create_user_command("FhirToFsh", function(cmd_opts)
        fhir_to_fsh(cmd_opts.args ~= "" and cmd_opts.args or nil)
      end, {
        nargs = "?",
        complete = "file",
        desc = "Convert a FHIR resource (JSON/XML) to FSH via gofsh",
      })

      -- <leader>fh  — F[S]H
      vim.api.nvim_create_autocmd("FileType", {
        pattern = "fsh",
        callback = function(ev)
          local function map(lhs, rhs, desc)
            vim.keymap.set("n", lhs, rhs, { buffer = ev.buf, desc = desc })
          end
          map("<leader>fho", open_fhir_docs, "FSH: open FHIR docs")
          map("<leader>fhb", fsh_build, "FSH: run sushi build")
          map("<leader>fhf", fsh_to_fhir, "FSH: convert FSH → FHIR")
          map("<leader>fhj", function()
            fhir_to_fsh(nil)
          end, "FSH: convert FHIR → FSH (current file)")
        end,
      })
    end,
  },
}
