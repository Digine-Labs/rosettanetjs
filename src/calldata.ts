import { concatenateBytes, encodeDynamicData, integerToBytes, isEncodableArray, padAndLengthPrefix, padLeftTo32Bytes, padRightTo32Bytes } from "./helpers"
import { Encodable, EncodableArray, EncodableTuple, EVMFunction, ParameterDescription } from "./types"

export function parseSignature(functionSignature: string): EVMFunction {
	const signatureMatcher = /^([a-zA-Z_][a-zA-Z0-9_]+)\((.*)\)$/
	const matchedSignature = signatureMatcher.exec(functionSignature)
	if (matchedSignature === null) throw new Error(`${functionSignature} is not a valid Solidity function signature.`)
	const name = matchedSignature[1]
	const inputs = parseParameters(matchedSignature[2])
	return { type: 'function', name, inputs, outputs: [] }
}

function parseParameters(functionParameters: string): Array<ParameterDescription> {
	const parameters: Array<ParameterDescription> = []
	let remainingParameters = functionParameters.trim()
	while (remainingParameters.length !== 0) {
		let {parameterDescription, remaining} = extractNextParameter(remainingParameters)
		remainingParameters = remaining
		parameters.push(parameterDescription)
	}
	// fill in any missing argument names
	return parameters.map((x, i) => ({ ...x, name: x.name || `arg${i}` }))
}

function extractNextParameter(functionParameters: string): {parameterDescription: ParameterDescription, remaining: string} {
	let nesting = 0
	let typeAndName = ''
	for (const character of functionParameters) {
		// walk until we reach either the end of the string or a comma outside of all parenthesis
		if (character === '(') ++nesting
		if (character === ')') --nesting
		if (nesting < 0) throw new Error(`${functionParameters} does not have matching number of open and close parenthesis`)
		if (nesting > 0) {
			typeAndName += character
			continue
		}
		if (character === ',') break
		typeAndName += character
	}
	const typeAndNameMatch = /^\s*(.+?)\s*(?:\s([a-zA-Z_][a-zA-Z0-9_]*))?\s*$/.exec(typeAndName)
	if (typeAndNameMatch === null) throw new Error(`${typeAndNameMatch} is not a valid parameter/name pair.`)
	let parameterType = typeAndNameMatch[1]
	let components: Array<ParameterDescription> | undefined = undefined
	if (parameterType.startsWith('(')) {
		const tupleTypes = parameterType.slice(1, parameterType.lastIndexOf(')'))
		parameterType = `tuple${parameterType.slice(tupleTypes.length + 2)}`
		components = parseParameters(tupleTypes)
	}
	const parameterName = typeAndNameMatch[2] || ''
	let remaining = functionParameters.slice(typeAndName.length)
	if (remaining.startsWith(',')) remaining = remaining.slice(1)
	remaining = remaining.trim()
	const parameterDescription: ParameterDescription = {
		name: parameterName,
		type: parameterType,
		components: components,
	}
	return { parameterDescription, remaining }
}

export function generateFullSignature(functionDescription: EVMFunction): string {
	return `${functionDescription.name}(${toFullParameters(functionDescription.inputs)})`
}

export function generateCanonicalSignature(functionDescription: EVMFunction): string {
	return `${functionDescription.name}(${toCanonicalParameters(functionDescription.inputs)})`
}

function toFullParameters(parameters: readonly ParameterDescription[]): string {
	return parameters.map(toFullParameter).join(', ')
}

function toCanonicalParameters(parameters: ReadonlyArray<ParameterDescription>): string {
	return parameters.map(toCanonicalParameter).join(',')
}

function toFullParameter(parameter: ParameterDescription): string {
	if (parameter.type.startsWith('tuple')) {
		if (parameter.components === undefined) throw new Error(`Encountered a 'tuple' type that had no components.  Did you mean to include an empty array?`)
		return `(${toFullParameters(parameter.components)})${parameter.type.slice('tuple'.length)} ${parameter.name}`
	} else {
		return `${parameter.type} ${parameter.name}`
	}
}

function toCanonicalParameter(parameter: ParameterDescription): string {
	if (parameter.type.startsWith('tuple')) {
		if (parameter.components === undefined) throw new Error(`Encountered a 'tuple' type that had no components.  Did you mean to include an empty array?`)
		return `(${toCanonicalParameters(parameter.components)})${parameter.type.slice('tuple'.length)}`
	} else {
		return parameter.type
	}
}

export async function encodeMethod(keccak256: (message: Uint8Array) => Promise<bigint>, functionDescription: EVMFunction, parameters: EncodableArray): Promise<Uint8Array>
export async function encodeMethod(keccak256: (message: Uint8Array) => Promise<bigint>, functionSignature: string, parameters: EncodableArray): Promise<Uint8Array>
export function encodeMethod(functionSelector: number, parameterDescriptions: ReadonlyArray<ParameterDescription>, parameters: EncodableArray): Uint8Array
export function encodeMethod(first: ((message: Uint8Array) => Promise<bigint>) | number, second: EVMFunction | string | ReadonlyArray<ParameterDescription> | EncodableArray, parameters: EncodableArray): Promise<Uint8Array> | Uint8Array {
	if (typeof first === 'number') return encodeMethodWithSelector(first, second as ReadonlyArray<ParameterDescription>, parameters)
	else if (typeof second === 'string') return encodeMethodWithSignature(first, second, parameters)
	else return encodeMethodWithDescription(first, second as EVMFunction, parameters)
}

async function encodeMethodWithDescription(keccak256: (message: Uint8Array) => Promise<bigint>, functionDescription: EVMFunction, parameters: EncodableArray): Promise<Uint8Array> {
	const canonicalSignature = generateCanonicalSignature(functionDescription)
	const canonicalSignatureHash = await keccak256(new TextEncoder().encode(canonicalSignature))
	const functionSelector = canonicalSignatureHash >> 224n
	return encodeMethod(Number(functionSelector), functionDescription.inputs, parameters)
}

async function encodeMethodWithSignature(keccak256: (message: Uint8Array) => Promise<bigint>, functionSignature: string, parameters: EncodableArray): Promise<Uint8Array> {
	const functionDescription = parseSignature(functionSignature)
	return await encodeMethodWithDescription(keccak256, functionDescription, parameters)
}

function encodeMethodWithSelector(functionSelector: number, parameterDescriptions: ReadonlyArray<ParameterDescription>, parameters: EncodableArray): Uint8Array {
	const encodedParameters = encodeParameters(parameterDescriptions, parameters)
	return new Uint8Array([...integerToBytes(functionSelector, 4), ...encodedParameters])
}

export function encodeParameters(descriptions: ReadonlyArray<ParameterDescription>, parameters: EncodableArray): Uint8Array {
	if (descriptions.length !== parameters.length) throw new Error(`Number of provided parameters (${parameters.length}) does not match number of expected parameters (${descriptions.length})`)
	const encodedParameters = parameters.map((nestedParameter, index) => encodeParameter(descriptions[index], nestedParameter))
	return encodeDynamicData(encodedParameters)
}

function encodeParameter(description: ParameterDescription, parameter: Encodable): { isDynamic: boolean, bytes: Uint8Array } {
	return tryEncodeFixedArray(description, parameter)
		|| tryEncodeDynamicArray(description, parameter)
		|| tryEncodeTuple(description, parameter)
		|| tryEncodeDynamicBytes(description, parameter)
		|| tryEncodeString(description, parameter)
		|| tryEncodeBoolean(description, parameter)
		|| tryEncodeNumber(description, parameter)
		|| tryEncodeAddress(description, parameter)
		|| tryEncodeFixedBytes(description, parameter)
		|| tryEncodeFixedPointNumber(description)
		|| tryEncodeFunction(description)
		|| function () { throw new Error(`Unsupported parameter type ${description.type}`) }()
}

function tryEncodeFixedArray(description: ParameterDescription, parameter: Encodable): { isDynamic: boolean, bytes: Uint8Array } | null {
	const match = /^(.*)\[(\d+)\]$/.exec(description.type)
	if (match === null) return null
	const size = Number.parseInt(match[2])
	if (!Array.isArray(parameter) || parameter.length !== size) throw new Error(`Can only encode a JavaScript 'array' of length ${size} into an EVM 'array' of length ${size}\n${parameter}`)
	const nestedDescription = Object.assign({}, description, { type: match[1] })
	const encodedParameters = parameter.map(nestedParameter => encodeParameter(nestedDescription, nestedParameter))
	const isDynamic = encodedParameters.some(x => x.isDynamic)
	if (isDynamic) {
		return { isDynamic: isDynamic, bytes: encodeDynamicData(encodedParameters)}
	} else {
		return { isDynamic: isDynamic, bytes: concatenateBytes(encodedParameters.map(x => x.bytes)) }
	}
}

function tryEncodeDynamicArray(description: ParameterDescription, parameter: Encodable): { isDynamic: true, bytes: Uint8Array } | null {
	if (!description.type.endsWith('[]')) return null
	if (!Array.isArray(parameter)) throw new Error(`Can only encode a JavaScript 'array' into an EVM 'array'\n${parameter}`)
	const nestedDescription = Object.assign({}, description, { type: description.type.substring(0, description.type.length - 2) })
	const encodedParameters = parameter.map(nestedParameter => encodeParameter(nestedDescription, nestedParameter))
	const lengthBytes = integerToBytes(encodedParameters.length)
	return { isDynamic: true, bytes: concatenateBytes([lengthBytes, encodeDynamicData(encodedParameters)]) }
}

function tryEncodeTuple(description: ParameterDescription, parameter: Encodable): { isDynamic: boolean, bytes: Uint8Array } | null {
	if (description.type !== 'tuple') return null
	if (typeof parameter !== 'object') throw new Error(`Can only encode a JavaScript 'object' or a JavaScript array into an EVM 'tuple'\n${parameter}`)
	if (description.components === undefined || description.components.length === 0) {
		return { isDynamic: false, bytes: new Uint8Array(0) }
	} else {
		const encodableTupleOrArray = parameter as EncodableTuple | EncodableArray
		const encodedComponents = description.components.map((component, index) => {
			const parameter = isEncodableArray(encodableTupleOrArray) ? encodableTupleOrArray[index] : encodableTupleOrArray[component.name]
			return encodeParameter(component, parameter)
		})
		const isDynamic = encodedComponents.some(x => x.isDynamic)
		return { isDynamic: isDynamic, bytes: isDynamic ? encodeDynamicData(encodedComponents) : concatenateBytes(encodedComponents.map(x => x.bytes)) }
	}
}

function tryEncodeDynamicBytes(description: ParameterDescription, parameter: Encodable): { isDynamic: true, bytes: Uint8Array } | null {
	if (description.type !== 'bytes') return null
	if (!(parameter instanceof Uint8Array)) throw new Error(`Can only encode a JavaScript 'Uint8Array' into EVM 'bytes'\n${parameter}`)
	return { isDynamic: true, bytes: padAndLengthPrefix(parameter) }
}

function tryEncodeString(description: ParameterDescription, parameter: Encodable): { isDynamic: true, bytes: Uint8Array } | null {
	if (description.type !== 'string') return null
	if (typeof parameter !== 'string') throw new Error(`Can only encode a JavaScript 'string' into an EVM 'string'\n${parameter}`)
	const encoded = new TextEncoder().encode(parameter)
	return { isDynamic: true, bytes: padAndLengthPrefix(encoded) }
}

function tryEncodeBoolean(description: ParameterDescription, parameter: Encodable): { isDynamic: false, bytes: Uint8Array } | null {
	if (description.type !== 'bool') return null
	if (typeof parameter !== 'boolean') throw new Error(`Can only encode JavaScript 'boolean' into EVM 'bool'\n${parameter}`)
	const bytes = new Uint8Array(32)
	bytes.set([parameter ? 1 : 0], 31)
	return { isDynamic: false, bytes }
}

function tryEncodeNumber(description: ParameterDescription, parameter: Encodable): { isDynamic: false, bytes: Uint8Array } | null {
	const match = /^(u?)int(\d*)$/.exec(description.type)
	if (match === null) return null
	if (typeof parameter !== 'bigint') throw new Error(`Can only encode a JavaScript 'bigint' into an EVM '${description.type}'\n${parameter}`)
	const size = Number.parseInt(match[2])
	if (size <= 0 || size > 256 || size % 8) throw new Error(`EVM numbers must be in range [8, 256] and must be divisible by 8.`)
	const signed = !match[1]
	if (!signed && parameter >= 2n**BigInt(size)) throw new Error(`Attempted to encode ${parameter} into a ${description.type}, but it is too big to fit.`)
	if (!signed && parameter < 0n) throw new Error(`Attempted to encode ${parameter} into a ${description.type}, but you cannot encode negative numbers into a ${description.type}.`)
	if (signed && parameter >= 2n**BigInt(size-1)) throw new Error(`Attempted to encode ${parameter} into a ${description.type}, but it is too big to fit.`)
	if (signed && parameter < -(2n**BigInt(size-1))) throw new Error(`Attempted to encode ${parameter} into a ${description.type}, but it is too big (of a negative number) to fit.`)
	const bytes = integerToBytes(parameter, 32, signed)
	return { isDynamic: false, bytes }
}

function tryEncodeAddress(description: ParameterDescription, parameter: Encodable): { isDynamic: false, bytes: Uint8Array } | null {
	if (description.type !== 'address') return null
	if (typeof parameter !== 'bigint') throw new Error(`Can only encode JavaScript 'bigint' into EVM 'address'\n${parameter}`)
	if (parameter > 0xffffffffffffffffffffffffffffffffffffffffn) throw new Error(`Attempted to encode 0x${parameter.toString(16)} into an EVM address, but it is too big to fit.`)
	if (parameter < 0n) throw new Error(`Attempted to encode ${parameter} into an EVM address, but addresses must be positive numbers.`)
	return { isDynamic: false, bytes: padLeftTo32Bytes(integerToBytes(parameter, 20)) }
}

function tryEncodeFixedBytes(description: ParameterDescription, parameter: Encodable): { isDynamic: false, bytes: Uint8Array } | null {
	const match = /^bytes(\d+)$/.exec(description.type)
	if (match === null) return null
	const size = Number.parseInt(match[1])
	if (typeof parameter !== 'bigint') throw new Error(`Can only encode JavaScript 'bigint' into EVM 'bytes${size}'\n${parameter}`)
	if (parameter >= 2n**BigInt(size * 8)) throw new Error(`Attempted to encode 0x${parameter.toString(16)} into an EVM ${description.type}, but it is too big to fit.`)
	if (parameter < 0n) throw new Error(`Attempted to encode -0x${parameter.toString(16).slice(1)} into an EVM ${description.type}, but you cannot encode negative numbers into a ${description.type}.`)
	return { isDynamic: false, bytes: padRightTo32Bytes(integerToBytes(parameter, size)) }
}

function tryEncodeFixedPointNumber(description: ParameterDescription): { isDynamic: never, bytes: Uint8Array } | null {
	if (!/^u?fixed\d+x\d+$/.test(description.type)) return null
	throw new Error(`Encoding into EVM type ${description.type} is not supported`)
}

function tryEncodeFunction(description: ParameterDescription): { isDynamic: never, bytes: Uint8Array } | null {
	if (description.type !== 'function') return null
	throw new Error(`Encoding into EVM type ${description.type} is not supported`)
}

