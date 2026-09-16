import { Fragment, useState } from "react";
import type { ModelRule, RecordValue } from "./api";
import { Badge, DataValue, Empty, Panel, profileLabel } from "./components";
import s from "./ui.module.scss";

type Facts = Pick<ModelRule, "capabilities" | "limits" | "metadata_by_profile">;
const record = (value: unknown): RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const names: Record<string, string> = {
  images: "图片",
  tools: "工具",
  reasoning: "思考",
  thinking_disable: "关闭思考",
};
const states: Record<string, string> = {
  supported: "支持",
  unsupported: "不支持",
  mixed: "因路由而异",
  unknown: "未知",
};
const labels: Record<string, string> = {
  id: "上游标识",
  name: "显示名称",
  vendor: "厂商标识",
  description: "说明",
  descriptionZh: "中文说明",
  descriptionEn: "英文说明",
  credits: "目录倍率（原值）",
  tags: "标签",
  isDefault: "上游默认模型",
  disabled: "上游停用",
  iconUrl: "图标地址（不自动加载）",
  supportsImages: "声明支持图片",
  disabledMultimodal: "禁用多模态",
  supportsToolCall: "声明支持工具",
  supportsReasoning: "声明支持思考",
  onlyReasoning: "仅思考模式",
  canDisableThinking: "允许关闭思考",
  supportsExtra: "上游扩展标记",
  maxInputTokens: "最大输入 Token",
  maxOutputTokens: "最大输出 Token",
  maxAllowedSize: "上游预算（原值）",
  contextWindow: "上下文窗口",
  defaultLength: "默认窗口",
  supportedLengths: "可选窗口",
  reasoning: "思考选项",
  defaultEffort: "默认强度",
  effort: "强度",
  supportedEfforts: "可选强度",
  summary: "摘要建议",
  relatedModels: "关联模型",
  lite: "普通模式",
  temperature: "温度建议",
  top_p: "Top P 建议",
  top_k: "Top K 建议",
  repetition_penalty: "重复惩罚建议",
};
const groups: [string, string[]][] = [
  [
    "基本信息",
    [
      "id",
      "name",
      "vendor",
      "description",
      "descriptionZh",
      "descriptionEn",
      "credits",
      "tags",
      "isDefault",
      "disabled",
      "iconUrl",
    ],
  ],
  [
    "能力与限制",
    [
      "supportsImages",
      "disabledMultimodal",
      "supportsToolCall",
      "supportsReasoning",
      "onlyReasoning",
      "canDisableThinking",
      "supportsExtra",
      "maxInputTokens",
      "maxOutputTokens",
      "maxAllowedSize",
      "contextWindow",
    ],
  ],
  [
    "思考与参数建议",
    [
      "reasoning",
      "relatedModels",
      "temperature",
      "top_p",
      "top_k",
      "repetition_penalty",
      "summary",
    ],
  ],
];

export function CapabilityBadges({ model, full = false }: { model: Facts; full?: boolean }) {
  const declared = record(model.capabilities);
  return (
    <div className={s.badgeStack}>
      {(full ? Object.keys(names) : ["images", "tools", "reasoning"]).map((key) => {
        const raw = declared[key];
        const state = typeof raw === "string" && Object.hasOwn(states, raw) ? raw : "unknown";
        return (
          <Badge
            key={key}
            tone={state === "supported" ? "good" : state === "mixed" ? "warn" : "neutral"}
          >
            {names[key]}：{states[state]}
          </Badge>
        );
      })}
      {variants(model.metadata_by_profile).some(([, rows]) =>
        rows.some((entry) => record(entry.catalog_source).kind === "shared"),
      ) && <Badge tone="neutral">国际共享目录</Badge>}
    </div>
  );
}

function MetaFields({ data, depth = 0 }: { data: RecordValue; depth?: number }) {
  return (
    <dl className={s.metadataFields}>
      {Object.entries(data).map(([key, value]) => (
        <Fragment key={key}>
          <dt title={key}>{Object.hasOwn(labels, key) ? labels[key] : key}</dt>
          <dd>
            {value !== null && typeof value === "object" && !Array.isArray(value) && depth < 3 ? (
              <MetaFields data={record(value)} depth={depth + 1} />
            ) : (
              <DataValue value={value} />
            )}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

function variants(value: unknown): [string, RecordValue[]][] {
  return Object.entries(record(value))
    .filter(([key]) => ["cn-cli", "cn-work", "intl-cli", "intl-work"].includes(key))
    .map(([profile, values]) => [profile, Array.isArray(values) ? values.map(record) : []]);
}

export function modelDisplayName(model: Facts): string {
  const values = [
    ...new Set(
      variants(model.metadata_by_profile)
        .flatMap(([, rows]) => rows.map((m) => m.name))
        .filter((name): name is string => typeof name === "string" && name.length > 0),
    ),
  ];
  return values.length === 1 ? values[0] : "";
}

function CatalogSource({ entry }: { entry: RecordValue }) {
  const source = record(entry.catalog_source);
  if (source.kind === "direct") return <p className={s.note}>目录来源：当前产品直接声明。</p>;
  if (source.kind !== "shared") return null;
  const profiles = Array.isArray(source.profiles)
    ? source.profiles.filter(
        (profile): profile is string =>
          typeof profile === "string" && ["intl-cli", "intl-work"].includes(profile),
      )
    : [];
  const originals = Array.isArray(entry.source_variants) ? entry.source_variants.map(record) : [];
  return (
    <Panel title="共享目录来源">
      <p className={s.note}>
        继承自{profiles.length ? profiles.map(profileLabel).join("、") : "未注明来源"}
        ；当前账号未直接声明此模型，权限与实际扣费以上游为准。
      </p>
      <div className={s.modelMetadata}>
        {originals.map((original, index) => (
          <details className={s.rawData} key={index}>
            <summary>
              {profileLabel(typeof original.profile === "string" ? original.profile : "")} ·
              来源版本 {index + 1}
            </summary>
            <MetaFields data={record(original.metadata)} />
          </details>
        ))}
      </div>
    </Panel>
  );
}

export function ModelMetadata({ model }: { model: Facts }) {
  const [selected, setSelected] = useState("");
  const sources = variants(model.metadata_by_profile);
  const active = sources.find(([profile]) => profile === selected) ?? sources[0];
  const limits = record(model.limits);
  return (
    <>
      <p className={s.note}>
        以下为上游声明，不代表模型原生模态或实测保证；目录参数不会自动覆盖客户端请求。
      </p>
      <Panel title="能力概要">
        <div className={s.modelMetadata}>
          <CapabilityBadges model={model} full />
          <dl className={s.metadataFields}>
            {["maxInputTokens", "maxOutputTokens"].map((key) => {
              const limit = record(limits[key]);
              return (
                <Fragment key={key}>
                  <dt>{labels[key]}</dt>
                  <dd>
                    {limit.state === "mixed" ? (
                      "因路由而异"
                    ) : limit.state === "known" ? (
                      <DataValue value={limit.value} />
                    ) : (
                      "未知"
                    )}
                  </dd>
                </Fragment>
              );
            })}
          </dl>
        </div>
      </Panel>
      {!active ? (
        <Empty title="尚无模型元数据">未知不等于不支持；请等待账号目录同步。</Empty>
      ) : (
        <>
          <label className={s.field}>
            查看产品声明
            <select value={active[0]} onChange={(event) => setSelected(event.target.value)}>
              {sources.map(([profile]) => (
                <option key={profile} value={profile}>
                  {profileLabel(profile)}
                </option>
              ))}
            </select>
          </label>
          {active[1].length > 1 && (
            <p className={s.note}>同一产品的账号声明存在差异；以下保留各版本，不公开账号身份。</p>
          )}
          {active[1].map((entry, index) => (
            <section
              key={`${active[0]}-${index}`}
              aria-label={`${profileLabel(active[0])} 声明 ${index + 1}`}
            >
              {active[1].length > 1 && <h3>声明 {index + 1}</h3>}
              {!Object.keys(entry).length && <Empty title="此来源未提供能力信息" />}
              <CatalogSource entry={entry} />
              {groups.map(([title, keys]) => {
                const data = Object.fromEntries(
                  keys.filter((key) => Object.hasOwn(entry, key)).map((key) => [key, entry[key]]),
                );
                return (
                  Object.keys(data).length > 0 && (
                    <Panel title={title} key={title}>
                      <div className={s.modelMetadata}>
                        <MetaFields data={data} />
                      </div>
                    </Panel>
                  )
                );
              })}
              <details className={s.rawData}>
                <summary>查看安全元数据 JSON</summary>
                <pre>{JSON.stringify(entry, null, 2)}</pre>
              </details>
            </section>
          ))}
        </>
      )}
    </>
  );
}
