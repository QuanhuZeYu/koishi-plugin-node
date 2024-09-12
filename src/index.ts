import path from "node:path";
import fs from "node:fs";
import { Context, Service, Schema } from "koishi";
import execa from 'execa';

export const name = 'QhzyNode';

export interface Config {
	storeDir: string,
	proxyPrefix: string
}

export const Config: Schema<Config> = Schema.object({
	storeDir: Schema.string().default('data/@QuanhuZeYu/node'),
	proxyPrefix: Schema.string().description('代理前缀').default(''),
});

declare module 'koishi' {
	interface Context {
		node: QhzyNode
	}
}

export class QhzyNode extends Service {

	constructor(ctx: Context, config: Config) {
		super(ctx, 'node');
		this.config = {
			storeDir: 'data/@QuanhuZeYu/node',
			proxyPrefix: '',
			...config,
		};
	}

	protected async start() {
		const logger = this.ctx.logger('QhzyNode')
		logger.info('node 服务启动成功');
	}

	/**
	 * 执行跨平台命令的函数
	 * @param command 要执行的命令
	 * @param args 执行命令的参数
	 * @param cwd 执行命令的工作目录
	 * @returns 执行结果的 Promise
	 */
	async runCommand(command: string, args: string[] = [], cwd?: string): Promise<string> {
		try {
			const { stdout } = await execa.execa(command, args, { cwd });
			return stdout;
		} catch (error) {
			throw new Error(`Error executing command: ${error.stderr || error.message}`);
		}
	}

	async safeImport<T>(packageName: string): Promise<T> {
		const logger = this.ctx.logger('QhzyNode')
		const proxy = this.config.proxyPrefix;
		const storeDir = path.resolve(this.ctx.baseDir, this.config.storeDir);
		const packDir = path.resolve(storeDir, packageName);

		logger.info(`导入包路径: [ ${storeDir} ]`);

		// 确保存储目录存在
		if (!fs.existsSync(storeDir)) {
			logger.info(`创建目录: [ ${storeDir} ]`);
			try {
				fs.mkdirSync(storeDir, { recursive: true });
			} catch (e) {
				logger.error(`创建目录失败: [ ${storeDir} ], 错误信息: ${(e as Error).message}`);
				throw e;
			}
		}

		// 检查包目录是否存在，不存在则安装
		if (!fs.existsSync(packDir)) {
			logger.info(`正在安装包: [ ${packageName} ]`);

			try {
				// 初始化 package.json 文件
				await this.runCommand(`${proxy}npm`, ['init', '-y'], storeDir);

				// 使用代理安装 npm 包
				await this.runCommand(`${proxy}npm`, ['install', packageName], storeDir);
				logger.info(`包安装完成: [ ${packageName} ]`);
			} catch (e) {
				logger.error(`安装包时出错: [ ${packageName} ], 错误信息: ${(e as Error).message}`);
				// 清理失败的安装目录
				if (fs.existsSync(packDir)) {
					fs.rmSync(packDir, { recursive: true, force: true });
				}
				throw e; // 抛出异常
			}
		} else {
			logger.info(`找到现有包: [ ${packageName} ]`);
		}

		// 返回已安装的模块
		try {
			return require(path.resolve(storeDir, "node_modules", packageName));
		} catch (e) {
			logger.error(`加载模块失败: [ ${packageName} ], 错误信息: ${(e as Error).message}`);

			// 失败则清除目录并重新安装
			try {
				logger.info(`清理目录: [ ${packDir} ] 并重试安装`);
				fs.rmSync(packDir, { recursive: true, force: true });
			} catch (err) {
				logger.error(`清理目录失败: [ ${packDir} ], 错误信息: ${(err as Error).message}`);
				throw err;
			}

			// 递归调用重新安装
			return this.safeImport(packageName);
		}
	}
}

export function apply(ctx: Context) {
	ctx.plugin(QhzyNode);
}
