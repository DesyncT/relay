const Sk = ({ w, h, style }) => <div className="sk" style={{ width: w, height: h, ...style }} />;
export default function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading usage">
      <div className="u-top">
        <div>
          <Sk w="280px" h="56px" style={{ margin: '8px 0' }} /><Sk w="200px" h="16px" style={{ marginBottom: 40 }} />
          {[0, 1].map((i) => <div className="u-tool" key={i}><Sk w="100%" h="24px" /><Sk w="180px" h="14px" style={{ margin: '6px 0 0 38px' }} /></div>)}
        </div>
        <div><Sk w="100px" h="16px" style={{ margin: '4px 0' }} /><div className="sk chart" /></div>
      </div>
      <Sk w="80px" h="16px" style={{ marginBottom: 20 }} />
      <div className="u-totals">{[0, 1, 2, 3, 4].map((i) => <div key={i}><Sk w="110px" h="14px" /><Sk w="90px" h="26px" style={{ marginTop: 10 }} /></div>)}</div>
      <div className="u-split">{[0, 1].map((i) => <div key={i}><Sk w="120px" h="16px" /><Sk w="100%" h="8px" style={{ margin: '18px 0 14px' }} /><Sk w="70%" h="14px" /></div>)}</div>
      <Sk w="100px" h="16px" style={{ marginBottom: 44 }} />
      {[0, 1, 2, 3].map((i) => <Sk key={i} w="100%" h="40px" style={{ marginBottom: 48 }} />)}
    </div>
  );
}
