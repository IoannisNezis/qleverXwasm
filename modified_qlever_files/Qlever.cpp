// Copyright 2025 The QLever Authors, in particular:
//
// 2025 Johannes Kalmbach <kalmbach@cs.uni-freiburg.de>, UFR
//
// UFR = University of Freiburg, Chair of Algorithms and Data Structures

#include "libqlever/Qlever.h"

#include "engine/ExportQueryExecutionTrees.h"
#include "engine/MaterializedViews.h"
#include "index/IndexImpl.h"
#include "index/TextIndexBuilder.h"
#include "libqlever/QleverTypes.h"
#include "parser/SparqlParser.h"

#include <emscripten/bind.h>
#include <unicode/udata.h>

namespace qlever {

// _____________________________________________________________________________
EMSCRIPTEN_KEEPALIVE Qlever::Qlever(const EngineConfig& config)
    : allocator_{ad_utility::AllocatorWithLimit<Id>{
          ad_utility::makeAllocationMemoryLeftThreadsafeObject(
              config.memoryLimit_.value_or(DEFAULT_MEM_FOR_QUERIES))}},
      index_{std::make_shared<Index>(allocator_)},
      enablePatternTrick_{!config.noPatterns_},
      disableCaching_{config.disableCaching_} {
  // Set runtime parameters relevant for caching and propagate them to the
  // cache.
  globalRuntimeParameters.wlock()->cacheMaxNumEntries_.setOnUpdateAction(
      [this](size_t newValue) { cache_.setMaxNumEntries(newValue); });
  globalRuntimeParameters.wlock()->cacheMaxSize_.setOnUpdateAction(
      [this](ad_utility::MemorySize newValue) { cache_.setMaxSize(newValue); });
  globalRuntimeParameters.wlock()->cacheMaxSizeSingleEntry_.setOnUpdateAction(
      [this](ad_utility::MemorySize newValue) {
        cache_.setMaxSizeSingleEntry(newValue);
      });

  // Load the index from disk.
  index_->usePatterns() = enablePatternTrick_;
  index_->loadAllPermutations() = !config.onlyPsoAndPos_;
  index_->doNotLoadPermutations() = config.doNotLoadPermutations_;
  index_->createFromOnDiskIndex(config.baseName_, config.persistUpdates_);
  if (config.loadTextIndex_) {
    index_->addTextFromOnDiskIndex();
  }

  materializedViewsManager_->setOnDiskBase(config.baseName_);

  // Estimate the cost of sorting operations (needed for query planning).
  sortPerformanceEstimator_.computeEstimatesExpensively(
      allocator_, index_->numTriples().normalAndInternal_() *
                      PERCENTAGE_OF_TRIPLES_FOR_SORT_ESTIMATE / 100);
}

// _____________________________________________________________________________
void EMSCRIPTEN_KEEPALIVE Qlever::buildIndex(IndexBuilderConfig config) {
  std::cout << "[buildIndex] starting" << std::endl;
  u_setDataDirectory("/icu/");
  try {

  Index index{ad_utility::makeUnlimitedAllocator<Id>()};

  // Set memory limit and parser buffer size if specified.
  if (config.memoryLimit_.has_value()) {
    index.memoryLimitIndexBuilding() = config.memoryLimit_.value();
    std::cout << "[buildIndex] memory limit: "
              << config.memoryLimit_.value().asString() << std::endl;
  } else {
    std::cout << "[buildIndex] memory limit: not set (default "
              << index.memoryLimitIndexBuilding().asString() << ")" << std::endl;
  }

  if (config.parserBufferSize_.has_value()) {
    index.parserBufferSize() = config.parserBufferSize_.value();
    std::cout << "[buildIndex] parser buffer: "
              << config.parserBufferSize_.value().asString() << std::endl;
  } else {
    std::cout << "[buildIndex] parser buffer: default" << std::endl;
  }

  // If no text index name was specified, take the part of the wordsfile after
  // the last slash.
  if (config.textIndexName_.empty() && !config.wordsfile_.empty()) {
    config.textIndexName_ =
        ad_utility::getLastPartOfString(config.wordsfile_, '/');
  }

  // Set all other configuration options.
  index.setKbName(config.kbIndexName_);
  index.setTextName(config.textIndexName_);
  index.usePatterns() = !config.noPatterns_;
  index.setOnDiskBase(config.baseName_);
  index.setKeepTempFiles(config.keepTemporaryFiles_);
  index.setSettingsFile(config.settingsFile_);
  index.loadAllPermutations() = !config.onlyPsoAndPos_;
  index.getImpl().setVocabularyTypeForIndexBuilding(config.vocabType_);
  index.getImpl().setPrefixesForEncodedValues(config.prefixesForIdEncodedIris_);
  std::cout << "[buildIndex] config applied, baseName=" << config.baseName_
            << ", inputFiles=" << config.inputFiles_.size() << std::endl;

  // Build index from input files.
  if (!config.onlyAddTextIndex_) {
    AD_CONTRACT_CHECK(!config.inputFiles_.empty());
    std::cout << "[buildIndex] calling createFromFiles..." << std::endl;
    index.createFromFiles(config.inputFiles_);
  }
  std::cout << "[buildIndex] index created successfully" << std::endl;
  if (config.wordsAndDocsFileSpecified() || config.addWordsFromLiterals_) {
#ifndef QLEVER_REDUCED_FEATURE_SET_FOR_CPP17
    auto textIndexBuilder = TextIndexBuilder(
        ad_utility::makeUnlimitedAllocator<Id>(), index.getOnDiskBase());
    textIndexBuilder.buildTextIndexFile(
        config.wordsAndDocsFileSpecified()
            ? std::optional{std::pair{config.wordsfile_, config.docsfile_}}
            : std::nullopt,
        config.addWordsFromLiterals_, config.textScoringMetric_,
        {config.bScoringParam_, config.kScoringParam_});
    if (!config.docsfile_.empty()) {
      textIndexBuilder.buildDocsDB(config.docsfile_);
    }
#else
    throw std::runtime_error(
        "Building a fulltext index is not supported using this restricted "
        "version of QLever");
#endif
  }
} catch (const std::exception& e) {
  std::cout << "buildIndex failed: " << e.what() << std::endl;
  throw;
}
}

// ___________________________________________________________________________
EMSCRIPTEN_KEEPALIVE std::string Qlever::query(std::string queryString,
                          ad_utility::MediaType mediaType) const {
  return query(parseAndPlanQuery(std::move(queryString)), mediaType);
}

// ___________________________________________________________________________
std::string Qlever::query(const QueryPlan& queryPlan,
                          ad_utility::MediaType mediaType) const {
  const auto& [qet, qec, parsedQuery] = queryPlan;
  ad_utility::Timer timer{ad_utility::Timer::Started};

  // TODO<joka921> For cancellation we have to call
  // `recursivelySetCancellationHandle` (see `Server::parseAndPlan`).
  auto handle = std::make_shared<ad_utility::CancellationHandle<>>();
  std::string result;
#ifndef QLEVER_REDUCED_FEATURE_SET_FOR_CPP17
  auto responseGenerator = ExportQueryExecutionTrees::computeResult(
      parsedQuery, *qet, mediaType, timer, std::move(handle));
  for (const auto& batch : responseGenerator) {
    result += batch;
  }
#else
  ad_utility::streams::StringBatcher yielder{
      [&result](std::string_view batch) { result.append(batch); }};
  ExportQueryExecutionTrees::computeResult(parsedQuery, *qet, mediaType, timer,
                                           std::move(handle),
                                           std::ref(yielder));

#endif
  return result;
}

// _____________________________________________________________________________
void Qlever::queryAndPinResultWithName(
    QueryExecutionContext::PinResultWithName options, std::string query) {
  auto queryPlan = parseAndPlanQuery(std::move(query));
  auto& [qet, qec, parsedQuery] = queryPlan;
  qec->pinResultWithName() = std::move(options);
  [[maybe_unused]] auto result = this->query(queryPlan);
}

// _____________________________________________________________________________
void EMSCRIPTEN_KEEPALIVE Qlever::queryAndPinResultWithName(std::string name, std::string query) {
  queryAndPinResultWithName(
      QueryExecutionContext::PinResultWithName{std::move(name)},
      std::move(query));
}

// _____________________________________________________________________________
void Qlever::clearNamedResultCache() { namedResultCache_.clear(); }

// _____________________________________________________________________________
void Qlever::eraseResultWithName(std::string name) {
  namedResultCache_.erase(name);
}

// ___________________________________________________________________________
Qlever::QueryPlan Qlever::parseAndPlanQuery(std::string query) const {
  auto qecPtr = std::make_shared<QueryExecutionContext>(
      index_, &cache_, allocator_, sortPerformanceEstimator_,
      &namedResultCache_, materializedViewsManager_, [](std::string) {}, false,
      false, disableCaching_);
  // TODO<joka921> support Dataset clauses.
  auto parsedQuery = SparqlParser::parseQuery(
      &index_->getImpl().encodedIriManager(), std::move(query), {});
  auto handle = std::make_shared<ad_utility::CancellationHandle<>>();
  QueryPlanner qp{qecPtr.get(), handle};
  qp.setEnablePatternTrick(enablePatternTrick_);
  auto qet = qp.createExecutionTree(parsedQuery);
  qet.isRoot() = true;

  auto qetPtr = std::make_shared<QueryExecutionTree>(std::move(qet));
  return {qetPtr, std::move(qecPtr), std::move(parsedQuery)};
}

// ___________________________________________________________________________
void IndexBuilderConfig::validate() const {
  if (kScoringParam_ < 0) {
    throw std::invalid_argument("The value of bm25-k must be >= 0");
  }
  if (bScoringParam_ < 0 || bScoringParam_ > 1) {
    throw std::invalid_argument(
        "The value of bm25-b must be between and "
        "including 0 and 1");
  }
  if (!(wordsAndDocsFileSpecified() ||
        (wordsfile_.empty() && docsfile_.empty()))) {
    throw std::runtime_error(absl::StrCat(
        "Only specified ", wordsfile_.empty() ? "docsfile" : "wordsfile",
        ". Both or none of docsfile and wordsfile have to be given to build "
        "text index. If none are given the option to add words from literals "
        "has to be true. For details see --help."));
  }
}

// ___________________________________________________________________________
void Qlever::writeMaterializedView(std::string name, std::string query) const {
  materializedViewsManager_->writeViewToDisk(
      std::move(name), parseAndPlanQuery(std::move(query)));
}

// ___________________________________________________________________________
bool Qlever::isMaterializedViewLoaded(const std::string& name) const {
  return materializedViewsManager_->isViewLoaded(name);
}

// ___________________________________________________________________________
void Qlever::loadMaterializedView(std::string name) const {
  materializedViewsManager_->loadView(name);
}

}  // namespace qlever

#ifdef EMSCRIPTEN

using namespace emscripten;

// Binding code
EMSCRIPTEN_BINDINGS(module) {
  enum_<qlever::Filetype>("Filetype")
    .value("Turtle", qlever::Filetype::Turtle)
    .value("NQuad", qlever::Filetype::NQuad);

  enum_<ad_utility::VocabularyType::Enum>("Vocabtype")
    .value("InMemUncompressed", ad_utility::VocabularyType::Enum::InMemoryUncompressed)
    .value("InMemoryCompressed", ad_utility::VocabularyType::Enum::InMemoryCompressed)
    .value("OnDiskUncompressed", ad_utility::VocabularyType::Enum::OnDiskUncompressed)
    .value("OnDiskCompressed",   ad_utility::VocabularyType::Enum::OnDiskCompressed);

  class_<qlever::InputFileSpecification>("InputFileSpecification")
    .constructor<>()
    .property("filename",
      optional_override([](const qlever::InputFileSpecification& self) {
        return self.filename();
      }),
      optional_override([](qlever::InputFileSpecification& self,
                           std::string value) {
        self.source_ = std::move(value);
      }))
    .property("filetype", &qlever::InputFileSpecification::filetype_)
    .property("defaultGraph", &qlever::InputFileSpecification::defaultGraph_);
  register_optional<std::string>();

  class_<qlever::CommonConfig>("CommonConfig")
    .constructor<>()
    .property("baseName", &qlever::CommonConfig::baseName_)
    .property("noPatterns", &qlever::CommonConfig::noPatterns_)
    .property("onlyPsoAndPos", &qlever::CommonConfig::onlyPsoAndPos_)
    .function("setMemoryLimitMB", optional_override([](qlever::CommonConfig& self, int mb) {
      self.memoryLimit_ = ad_utility::MemorySize::megabytes(mb);
    }));

  class_<qlever::IndexBuilderConfig, base<qlever::CommonConfig>>("IndexBuilderConfig")
    .constructor<>()
    .function("validate", &qlever::IndexBuilderConfig::validate)
    .property("inputFiles", &qlever::IndexBuilderConfig::inputFiles_)
    .property("settingsFile", &qlever::IndexBuilderConfig::settingsFile_)
    .property("vocabType",
      optional_override([](const qlever::IndexBuilderConfig& self) {
        return self.vocabType_.value();
      }),
      optional_override([](qlever::IndexBuilderConfig& self,
                           ad_utility::VocabularyType::Enum value) {
        self.vocabType_ = ad_utility::VocabularyType{value};
      }))
    .function("setParserBufferSizeMB", optional_override([](qlever::IndexBuilderConfig& self, int mb) {
      self.parserBufferSize_ = ad_utility::MemorySize::megabytes(mb);
    }));
  register_vector<qlever::InputFileSpecification>("InputFileSpecificationVector");
  
  class_<qlever::EngineConfig>("EngineConfig")
    .constructor<qlever::IndexBuilderConfig>();
  
  class_<qlever::Qlever>("Qlever")
    .constructor<const qlever::EngineConfig&>()
    .class_function("buildIndex", &qlever::Qlever::buildIndex)
    .function("query", select_overload<std::string(std::string, ad_utility::MediaType) const>(&qlever::Qlever::query));

  enum_<ad_utility::MediaType>("MediaType")
  .value("textPlain", ad_utility::MediaType::textPlain)
  .value("json", ad_utility::MediaType::json)
  .value("sparqlJson", ad_utility::MediaType::sparqlJson)
  .value("sparqlXml", ad_utility::MediaType::sparqlXml)
  .value("qleverJson", ad_utility::MediaType::qleverJson)
  .value("tsv", ad_utility::MediaType::tsv)
  .value("csv", ad_utility::MediaType::csv)
  .value("csv", ad_utility::MediaType::csv)
  ;
}

#endif